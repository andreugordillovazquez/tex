import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { build } from "esbuild"
import { JSDOM } from "jsdom"
import React, { act } from "react"

const require = createRequire(import.meta.url)
const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const mathJaxSource = await readFile(new URL("../node_modules/mathjax/es5/tex-svg.js", import.meta.url), "utf8")
let moduleId = 0
const compiledDirectory = await mkdtemp(join(tmpdir(), "tex-tests-"))
after(() => rm(compiledDirectory, { recursive: true, force: true }))

async function importSource(path, mockModules = {}) {
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    loader: { ".css": "empty" },
    plugins: [{
      name: "test-host",
      setup(builder) {
        builder.onResolve({ filter: /^react(?:\/|$)/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
        builder.onResolve({ filter: /^(framer-plugin|\.\/mathjax)$/ }, args => {
          if (mockModules[args.path]) return { path: args.path, namespace: "mock" }
        })
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mockModules[args.path], loader: "js" }))
      },
    }],
  })
  const compiledPath = join(compiledDirectory, `${moduleId++}.mjs`)
  await writeFile(compiledPath, result.outputFiles[0].text)
  return import(pathToFileURL(compiledPath).href)
}

function installDOM() {
  const dom = new JSDOM('<!doctype html><html><head></head><body data-framer-theme="dark"><div id="root"></div></body></html>', {
    runScripts: "outside-only",
    url: "https://tex.test/",
  })
  const keys = ["window", "document", "HTMLElement", "SVGElement", "XMLSerializer", "DOMParser", "IS_REACT_ACT_ENVIRONMENT"]
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "window" ? dom.window : dom.window[key] })
  }
  return {
    dom,
    close() {
      dom.window.close()
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}

function useLocalMathJax(window) {
  const append = window.document.head.appendChild.bind(window.document.head)
  window.document.head.appendChild = node => {
    append(node)
    if (node.tagName === "SCRIPT") {
      queueMicrotask(() => {
        // The production configuration and MathJax share a browser realm. Node's
        // objects must be copied into jsdom's realm for MathJax's option merging.
        window.MathJax = window.JSON.parse(JSON.stringify(window.MathJax))
        window.eval(mathJaxSource)
        node.onload?.(new window.Event("load"))
      })
    }
    return node
  }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function svgFor(latex) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 -100 1000 500")
  const text = document.createElementNS(svg.namespaceURI, "text")
  text.textContent = latex
  svg.appendChild(text)
  return svg
}

async function mountApp(mode = "canvas", options = {}) {
  const environment = installDOM()
  if (options.theme) document.body.setAttribute("data-framer-theme", options.theme)
  const calls = { showUI: [], upload: [], frame: [], image: [], selection: [], notifications: [], renders: [] }
  globalThis.__texTestFramer = {
    mode,
    showUI: value => calls.showUI.push(value),
    uploadImage: async value => { calls.upload.push(value); return options.upload ? options.upload(value) : { id: "image" } },
    createFrameNode: async value => { calls.frame.push(value); return { id: "frame" } },
    setImage: async value => { calls.image.push(value); if (options.setImage) await options.setImage(value) },
    setSelection: async value => { calls.selection.push(value) },
    notify: (...value) => calls.notifications.push(value),
  }
  globalThis.__texTestMathJax = {
    loadMathJax: options.load || (() => Promise.resolve()),
    renderEquation: async latex => {
      calls.renders.push(latex)
      return options.render ? options.render(latex) : svgFor(latex)
    },
  }
  const { App } = await importSource("src/App.tsx", {
    "framer-plugin": "export const framer = globalThis.__texTestFramer",
    "./mathjax": "export const { loadMathJax, renderEquation } = globalThis.__texTestMathJax",
  })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(App))))
  return {
    ...environment,
    calls,
    get submit() { return document.querySelector("button.submit") },
    async example(index = 1) {
      await act(async () => {
        const select = document.querySelector("select")
        select.value = select.options[index].value
        select.dispatchEvent(new window.Event("change", { bubbles: true }))
      })
    },
    async input(value) {
      await act(async () => {
        const textarea = document.querySelector("textarea")
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(textarea, value)
        textarea.dispatchEvent(new window.Event("input", { bubbles: true }))
      })
    },
    async settle() { await act(async () => new Promise(resolve => setTimeout(resolve, 180))) },
    async unmount() {
      await act(async () => root.unmount())
      environment.close()
      delete globalThis.__texTestFramer
      delete globalThis.__texTestMathJax
    },
  }
}

test("real MathJax renders every starter as a standalone SVG with matching export dimensions", async () => {
  const environment = installDOM()
  try {
    useLocalMathJax(window)
    const renderer = await importSource("src/mathjax.ts")
    const { createEquationImage } = await importSource("src/equation.ts")
    const { equationExamples } = await importSource("src/examples.ts")
    const firstLoad = renderer.loadMathJax()
    assert.equal(renderer.loadMathJax(), firstLoad)
    await firstLoad
    assert.equal(document.querySelectorAll("script").length, 1)
    for (const example of equationExamples) {
      const original = await renderer.renderEquation(example.latex)
      const image = createEquationImage(original, "#123456", false)
      const exported = new DOMParser().parseFromString(decodeURIComponent(image.dataUrl.split(",")[1]), "image/svg+xml")
      const svg = exported.documentElement
      assert.equal(exported.querySelector("parsererror"), null, example.label)
      assert.equal(Number(svg.getAttribute("width")), image.width)
      assert.equal(Number(svg.getAttribute("height")), image.height)
      assert.equal(svg.getAttribute("color"), "#123456")
      assert.equal(svg.firstElementChild.tagName, "defs")
      for (const use of svg.querySelectorAll("use")) {
        const reference = use.getAttribute("href") || use.getAttributeNS("http://www.w3.org/1999/xlink", "href")
        assert.ok(reference?.startsWith("#"))
        assert.ok(exported.getElementById(reference.slice(1)), `${example.label}: missing glyph`)
      }
      const solid = createEquationImage(original, "#FFFFFF", "#ABCDEF")
      const background = new DOMParser().parseFromString(solid.svg, "image/svg+xml").documentElement.firstElementChild
      assert.equal(background.tagName, "rect")
      assert.equal(background.getAttribute("fill"), "#ABCDEF")
      assert.notEqual(original.getAttribute("width"), "300", "export must not mutate MathJax output")
    }
    await assert.rejects(renderer.renderEquation(String.raw`\unknowncommand`), /Undefined control sequence/)
    await assert.rejects(renderer.renderEquation(String.raw`\frac{a}`))
    assert.ok(await renderer.renderEquation("x < y"), "literal comparison signs should render as math")
    const svg = await renderer.renderEquation("x")
    svg.setAttribute("viewBox", "0 0 0 1")
    assert.throws(() => createEquationImage(svg, "#000000", false), /invalid dimensions/)
  } finally {
    environment.close()
  }
})

test("failed renderer initialization can be retried and concurrent conversions run serially", async () => {
  const environment = installDOM()
  try {
    let attempts = 0
    let active = 0
    let maxActive = 0
    const append = document.head.appendChild.bind(document.head)
    document.head.appendChild = script => {
      append(script)
      attempts++
      queueMicrotask(() => {
        if (attempts === 1) script.onerror(new window.Event("error"))
        else {
          window.MathJax = {
            startup: { promise: Promise.resolve() },
            tex2svgPromise: async latex => {
              active++
              maxActive = Math.max(maxActive, active)
              await new Promise(resolve => setTimeout(resolve, 5))
              active--
              const container = document.createElement("div")
              container.append(svgFor(latex))
              return container
            },
          }
          script.onload(new window.Event("load"))
        }
      })
      return script
    }
    const renderer = await importSource("src/mathjax.ts")
    await assert.rejects(renderer.loadMathJax(), /Please retry/)
    assert.equal(document.querySelectorAll("script").length, 0)
    await renderer.loadMathJax()
    await Promise.all([renderer.renderEquation("a"), renderer.renderEquation("b"), renderer.renderEquation("c")])
    assert.equal(attempts, 2)
    assert.equal(maxActive, 1)
  } finally {
    environment.close()
  }
})

test("canvas insertion matches the transparent export and blocks duplicate submissions", async () => {
  const pendingUpload = deferred()
  const app = await mountApp("canvas", { upload: () => pendingUpload.promise })
  try {
    assert.equal(app.submit.disabled, true)
    await app.example()
    assert.equal(app.submit.textContent, "Rendering...")
    assert.equal(app.submit.disabled, true)
    await app.settle()
    await act(async () => document.querySelector(".erase").click())
    await app.settle()
    assert.equal(document.querySelector(".color-input .placeholder").textContent, "Transparent")
    await act(async () => { app.submit.click(); app.submit.click() })
    assert.equal(app.calls.upload.length, 1)
    assert.equal(app.submit.textContent, "Adding...")
    await act(async () => pendingUpload.resolve({ id: "image" }))
    const exported = new DOMParser().parseFromString(decodeURIComponent(app.calls.upload[0].image.split(",")[1]), "image/svg+xml").documentElement
    assert.equal(exported.firstElementChild.tagName, "text", "transparent export has no background rectangle")
    assert.equal(app.calls.frame[0].width, `${exported.getAttribute("width")}px`)
    assert.equal(app.calls.frame[0].height, `${exported.getAttribute("height")}px`)
    assert.deepEqual(app.calls.selection, [["frame"]])
    assert.equal(app.calls.image.length, 0)
    assert.equal(app.submit.disabled, false)
    await app.input("   ")
    assert.equal(app.submit.disabled, true)
    assert.equal(document.querySelector(".latex-preview svg"), null)
  } finally {
    await app.unmount()
  }
})

test("image mode preserves light-theme colors and reuses the starter selector", async () => {
  const app = await mountApp("image", { theme: "light" })
  try {
    await app.example(2)
    await app.settle()
    assert.equal(document.querySelector("select").value, "")
    await app.example(2)
    assert.equal(app.submit.disabled, false, "selecting the current example must keep its valid preview")
    assert.equal(app.submit.textContent, "Use Equation")
    await act(async () => app.submit.click())
    assert.equal(app.calls.image.length, 1)
    assert.equal(app.calls.frame.length, 0)
    assert.equal(app.calls.upload.length, 0)
    const svg = new DOMParser().parseFromString(decodeURIComponent(app.calls.image[0].image.split(",")[1]), "image/svg+xml").documentElement
    assert.equal(svg.getAttribute("color"), "#000000")
    assert.equal(svg.firstElementChild.getAttribute("fill"), "#F3F3F3")
    await app.input("changed")
    await app.example(2)
    await app.settle()
    assert.equal(document.querySelector("textarea").value, app.calls.image[0].altText)
  } finally {
    await app.unmount()
  }
})

test("rapid edits discard stale renders and errors cannot submit the previous equation", async () => {
  const oldRender = deferred()
  const app = await mountApp("canvas", { render: latex => latex === "old" ? oldRender.promise : latex === "invalid" ? Promise.reject(new Error("Invalid equation")) : Promise.resolve(svgFor(latex)) })
  try {
    await app.input("old")
    await app.settle()
    await app.input("new")
    await app.settle()
    assert.equal(document.querySelector(".latex-preview text").textContent, "new")
    await act(async () => oldRender.resolve(svgFor("old")))
    assert.equal(document.querySelector(".latex-preview text").textContent, "new")
    await app.input("invalid")
    assert.equal(app.submit.disabled, true)
    await app.settle()
    assert.equal(document.querySelector('[role="alert"]').textContent, "Invalid equation")
    assert.equal(document.querySelector(".latex-preview svg"), null)
    assert.equal(app.submit.disabled, true)
    await app.input("recovered")
    await app.settle()
    assert.equal(document.querySelector('[role="alert"]'), null)
    assert.equal(app.submit.disabled, false)
  } finally {
    await app.unmount()
  }
})

test("the existing submit button retries loading after failure", async () => {
  const loading = deferred()
  let attempts = 0
  const app = await mountApp("canvas", { load: () => ++attempts <= 2 ? loading.promise : Promise.resolve() })
  try {
    await act(async () => loading.reject(new Error("Could not load renderer")))
    assert.equal(app.submit.textContent, "Retry loading")
    assert.equal(app.submit.disabled, false)
    await act(async () => app.submit.click())
    assert.equal(document.querySelector('[role="alert"]'), null)
    await app.example()
    await app.settle()
    assert.equal(app.submit.disabled, false)
  } finally {
    await app.unmount()
  }
})
