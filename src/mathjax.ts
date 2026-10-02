interface MathJaxRuntime {
  startup: { promise: Promise<void> }
  tex2svgPromise: (latex: string, options: { display: boolean }) => Promise<HTMLElement>
}

interface MathJaxConfiguration {
  startup: { typeset: boolean; promise?: Promise<void> }
  svg: { fontCache: "local" }
  tex: { packages: { "[-]": string[] } }
  options: { enableMenu: boolean }
}

declare global {
  interface Window {
    MathJax?: MathJaxRuntime | MathJaxConfiguration
  }
}

let loadingPromise: Promise<MathJaxRuntime> | undefined
let renderingQueue: Promise<void> = Promise.resolve()

// Share initialization across mounts, including React StrictMode's effect replay.
export function loadMathJax(): Promise<MathJaxRuntime> {
  if (loadingPromise) return loadingPromise

  const script = document.createElement("script")
  script.src = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"
  script.async = true
  window.MathJax = {
    startup: { typeset: false },
    svg: { fontCache: "local" },
    tex: { packages: { "[-]": ["noundefined"] } },
    options: { enableMenu: false },
  }

  loadingPromise = new Promise<MathJaxRuntime>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Equation renderer took too long to load. Please retry."))
    }, 20000)

    const fail = (error: unknown) => {
      window.clearTimeout(timeout)
      reject(error)
    }

    script.onerror = () => fail(new Error("Could not load the equation renderer. Please retry."))
    script.onload = async () => {
      try {
        if (!window.MathJax?.startup.promise) {
          throw new Error("Could not initialize the equation renderer. Please retry.")
        }
        // Conversion methods are installed during startup, after the script's load event.
        await window.MathJax.startup.promise
        const mathJax = window.MathJax
        if (!mathJax || !("tex2svgPromise" in mathJax)) {
          throw new Error("Could not initialize the equation renderer. Please retry.")
        }
        window.clearTimeout(timeout)
        resolve(mathJax)
      } catch (error) {
        fail(error)
      }
    }

    document.head.appendChild(script)
  }).catch((error: unknown) => {
    script.onload = null
    script.onerror = null
    script.remove()
    loadingPromise = undefined
    throw error
  })

  return loadingPromise
}

export function renderEquation(latex: string): Promise<SVGElement> {
  const result = renderingQueue.then(async () => {
    const mathJax = await loadMathJax()
    const container = await mathJax.tex2svgPromise(latex, { display: true })
    const svg = container.querySelector("svg")
    if (!svg) throw new Error("Could not render this equation.")

    // MathJax normally renders TeX errors as an SVG rather than rejecting.
    const error = svg.querySelector('[data-mml-node="merror"]')
    if (error) {
      throw new Error(error.getAttribute("data-mjx-error") || "Invalid LaTeX equation.")
    }
    return svg
  })

  // MathJax 3 conversions must be serialized; a failed expression must not stop the queue.
  renderingQueue = result.then(() => undefined, () => undefined)
  return result
}
