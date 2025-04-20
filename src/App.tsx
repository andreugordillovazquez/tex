import { framer } from "framer-plugin"
import { useState, useEffect, useRef } from "react"
import katex from "katex"
import html2canvas from "html2canvas"
import "katex/dist/katex.min.css"
import "./App.css"
import { ColorInput } from "./ColorInput"

framer.showUI({ position: "top right", width: 260, height: 444, resizable: false })

export function App() {
  // LaTeX input and rendering
  const [latexInput, setLatexInput] = useState("")
  const [previewHtml, setPreviewHtml] = useState("")
  const [textColor, setTextColor] = useState("#FFFFFF")
  const [bgColor, setBgColor] = useState("#000000")
  const [resolution, setResolution] = useState("High")

  const resolutionOptions = [
    { value: "High", label: "High" },
    { value: "Medium", label: "Medium" },
    { value: "Low", label: "Low" },
  ]

  // Reference for the preview element
  const previewRef = useRef<HTMLDivElement>(null)

  // Theme-based default colors
  useEffect(() => {
    const isDark = document.body.getAttribute("data-framer-theme") === "dark"
    setTextColor(isDark ? "#FFFFFF" : "#000000")
    setBgColor(isDark ? "#000000" : "#F3F3F3")
  }, [])

  // Render LaTeX to HTML
  useEffect(() => {
    if (!latexInput) {
      setPreviewHtml("")
      return
    }
    try {
      const html = katex.renderToString(latexInput, {
        throwOnError: false,
        displayMode: true,
      })
      setPreviewHtml(html)
    } catch {
      framer.notify("Invalid LaTeX equation", { variant: "error", durationMs: 3000 })
    }
  }, [latexInput])

  // Compute scale factor
  const getScale = () => {
    switch (resolution) {
      case "High": return 50
      case "Medium": return 25
      case "Low": return 10
      default: return 25
    }
  }

  // Add LaTeX image to canvas
  const handleAddLatexImage = async () => {
    if (!latexInput.trim()) {
      framer.notify("Please enter a LaTeX equation", { variant: "error", durationMs: 3000 })
      return
    }
    const el = previewRef.current
    if (!el) return

    try {
      const canvas = await html2canvas(el, {
        backgroundColor: bgColor,
        scale: getScale(),
        logging: false,
        useCORS: true,
        allowTaint: true,
      } as any)

      const dataUrl = canvas.toDataURL("image/png")
      const notification = framer.notify("Adding equation...", { variant: "info" })
      await framer.addImage({ image: dataUrl, name: "Equation.png", altText: latexInput })
      notification.close()
      framer.notify("Equation added to canvas", { variant: "success", durationMs: 3000 })
    } catch (err) {
      console.error("Failed to add LaTeX image:", err)
      framer.notify("Failed to add image to canvas", { variant: "error", durationMs: 3000 })
    }
  }

  return (
    <main>
      <div className="input-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p>Convert LaTeX expressions into images for your website.</p>
          <textarea
            className="latex-input"
            value={latexInput}
            onChange={e => setLatexInput(e.target.value)}
            placeholder={`Insert LaTeX equation\ne.g. \\frac{a}{b}`}
          />
          <div className="latex-preview" style={{ backgroundColor: bgColor }}>
            <div
              ref={previewRef}
              className="latex-capture-target"
              style={{ color: textColor, backgroundColor: bgColor }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>

        <div className="gui">
          <div className="gui-row">
            <label className="gui-label">Text</label>
            <ColorInput value={textColor} onChange={v => setTextColor(v as string)} />
          </div>
          <div className="gui-row">
            <label className="gui-label">Background</label>
            <ColorInput value={bgColor} onChange={v => setBgColor(v as string)} />
          </div>
          <div className="gui-row">
            <label className="gui-label">Resolution</label>
            <select
              className="gui-select"
              value={resolution}
              onChange={e => setResolution(e.target.value)}
            >
              {resolutionOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="submit" onClick={handleAddLatexImage}>
          Add to Canvas
        </button>
      </div>
    </main>
  )
}