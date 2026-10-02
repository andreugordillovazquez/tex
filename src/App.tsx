import { framer } from "framer-plugin"
import { useState, useEffect, useRef } from "react"
import "./App.css"
import { ColorInput } from "./ColorInput"
import { createEquationImage, type EquationImage } from "./equation"
import { equationExamples } from "./examples"
import { loadMathJax, renderEquation } from "./mathjax"

// The additional example row uses the existing controls and needs 40px of space.
framer.showUI({ position: "top right", width: 260, height: 446, resizable: false })

interface Preview {
  latex: string
  textColor: string
  bgColor: string | false
  image: EquationImage
}

export function App() {
  const pluginMode = framer.mode
  const [latexInput, setLatexInput] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [textColor, setTextColor] = useState("#FFFFFF")
  const [bgColor, setBgColor] = useState<string | false>("#000000")
  const [rendererState, setRendererState] = useState<"loading" | "ready" | "error">("loading")
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setRendererState("loading")
    setError("")
    loadMathJax().then(() => {
      if (!cancelled) setRendererState("ready")
    }).catch((error: unknown) => {
      if (cancelled) return
      setRendererState("error")
      setError(error instanceof Error ? error.message : "Could not load the equation renderer. Please retry.")
    })
    return () => { cancelled = true }
  }, [loadAttempt])

  useEffect(() => {
    const isDark = document.body.getAttribute("data-framer-theme") === "dark"
    setTextColor(isDark ? "#FFFFFF" : "#000000")
    setBgColor(isDark ? "#000000" : "#F3F3F3")
  }, [])

  useEffect(() => {
    setPreview(null)
    if (rendererState !== "ready") return
    setError("")
    if (!latexInput.trim()) return

    let cancelled = false
    const timeout = window.setTimeout(async () => {
      try {
        const svg = await renderEquation(latexInput)
        if (cancelled) return
        const image = createEquationImage(svg, textColor, bgColor)
        setPreview({ latex: latexInput, textColor, bgColor, image })
      } catch (error: unknown) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Invalid LaTeX equation.")
        }
      }
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [latexInput, rendererState, textColor, bgColor])

  // Comparing the inputs also blocks submission before the effect has invalidated a previous preview.
  const currentPreview = preview && preview.latex === latexInput &&
    preview.textColor === textColor && preview.bgColor === bgColor ? preview : null
  const isRendering = rendererState === "ready" && !!latexInput.trim() && !currentPreview && !error
  const selectedExample = equationExamples.find(example => example.latex === latexInput)?.latex || ""

  const changeLatex = (value: string) => {
    if (value === latexInput) return
    setLatexInput(value)
    setPreview(null)
    if (rendererState === "ready") setError("")
  }

  const handleSubmit = async () => {
    if (rendererState === "error") {
      setRendererState("loading")
      setError("")
      setLoadAttempt(attempt => attempt + 1)
      return
    }
    if (!currentPreview || submittingRef.current) return

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const imageInput = { image: currentPreview.image.dataUrl, altText: currentPreview.latex }
      if (pluginMode === "image") {
        await framer.setImage(imageInput)
        framer.notify("Equation image set", { variant: "success", durationMs: 3000 })
      } else {
        const image = await framer.uploadImage(imageInput)
        const frame = await framer.createFrameNode({
          width: `${currentPreview.image.width}px`,
          height: `${currentPreview.image.height}px`,
          name: "Equation Frame",
          backgroundImage: image,
        })
        if (!frame) throw new Error("Failed to create frame")
        await framer.setSelection([frame.id])
        framer.notify("Equation added to canvas", { variant: "success", durationMs: 3000 })
      }
    } catch (error) {
      console.error("Failed to insert equation:", error)
      framer.notify(pluginMode === "image" ? "Failed to set image" : "Failed to add image to canvas", {
        variant: "error", durationMs: 3000,
      })
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const previewStyle = {
    color: textColor,
    backgroundColor: bgColor || "transparent",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "60px",
  }

  return (
    <main>
      <div className="input-container">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p>
            {pluginMode === "image"
              ? "Create a LaTeX equation image to use in your design."
              : "Convert LaTeX expressions into images for your website."
            }
          </p>
          <div>
            <div className="gui-row">
              <label className="gui-label" htmlFor="equation-example">Example</label>
              <select
                id="equation-example"
                className="gui-select"
                value={selectedExample}
                onChange={e => changeLatex(e.target.value)}
              >
                <option value="" disabled>{latexInput.trim() ? "Custom equation" : "Choose example..."}</option>
                {equationExamples.map(example => (
                  <option key={example.label} value={example.latex}>{example.label}</option>
                ))}
              </select>
            </div>
            <textarea
              className="latex-input"
              aria-label="LaTeX equation"
              value={latexInput}
              onChange={e => changeLatex(e.target.value)}
              placeholder={`Insert LaTeX equation\ne.g. \\frac{a}{b}`}
            />
          </div>
          <div className="latex-preview" style={{ backgroundColor: bgColor || "transparent" }} aria-busy={isRendering}>
            {currentPreview ? (
              <div
                className="latex-capture-target"
                style={previewStyle}
                dangerouslySetInnerHTML={{ __html: currentPreview.image.svg }}
              />
            ) : (
              <div className="latex-capture-target" style={previewStyle}>
                {error ? (
                  <span className="error-message" role="alert">{error}</span>
                ) : (
                  <span role="status">{isRendering ? "Rendering..." : ""}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="gui">
          <div className="gui-row">
            <label className="gui-label">Text</label>
            <ColorInput label="Text color" value={textColor} onChange={value => {
              if (value) setTextColor(value)
            }} />
          </div>
          <div className="gui-row">
            <label className="gui-label">Background</label>
            <ColorInput label="Background color" value={bgColor} onChange={setBgColor} erasable />
          </div>
        </div>

        <button
          className="submit"
          onClick={handleSubmit}
          disabled={isSubmitting || (rendererState !== "error" && !currentPreview)}
        >
          {isSubmitting ? "Adding..."
            : rendererState === "error" ? "Retry loading"
            : rendererState === "loading" ? "Loading..."
            : isRendering ? "Rendering..."
            : pluginMode === "image" ? "Use Equation" : "Add to Canvas"
          }
        </button>
      </div>
    </main>
  )
}
