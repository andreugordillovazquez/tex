import { framer } from "framer-plugin"
import { useState, useEffect, useRef } from "react"
import "./App.css"
import { ColorInput } from "./ColorInput"

// MathJax types
declare global {
  interface Window {
    MathJax: any
  }
}

framer.showUI({ position: "top right", width: 260, height: 406, resizable: false })

export function App() {
  // Plugin mode
  const pluginMode = framer.mode
  
  // LaTeX input and rendering
  const [latexInput, setLatexInput] = useState("")
  const [previewSvg, setPreviewSvg] = useState("")
  const [textColor, setTextColor] = useState("#FFFFFF")
  const [bgColor, setBgColor] = useState("#000000")
  const [isMathJaxReady, setIsMathJaxReady] = useState(false)

  // Reference for the preview element
  const previewRef = useRef<HTMLDivElement>(null)

  // Initialize MathJax
  useEffect(() => {
    const loadMathJax = async () => {
      // Load MathJax tex-svg component directly
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js'
      script.async = true
      
      script.onload = () => {
        // Wait a bit for MathJax to fully initialize
        setTimeout(() => {
          if (window.MathJax && window.MathJax.typesetPromise) {
            // Configure MathJax after it's loaded
            window.MathJax = {
              ...window.MathJax,
              tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
                processEscapes: true,
                processEnvironments: true
              },
              svg: {
                fontCache: 'global'
              },
              options: {
                enableMenu: false,
                menuOptions: {
                  settings: {
                    texHints: true,
                    semantics: false,
                    renderer: 'SVG'
                  }
                }
              }
            }
            setIsMathJaxReady(true)
          }
        }, 1000)
      }
      
      script.onerror = (error) => {
        console.error('Failed to load MathJax:', error)
        framer.notify("Failed to load MathJax", { variant: "error", durationMs: 3000 })
      }
      
      document.head.appendChild(script)
    }

    loadMathJax()
  }, [])

  // Theme-based default colors
  useEffect(() => {
    const isDark = document.body.getAttribute("data-framer-theme") === "dark"
    setTextColor(isDark ? "#FFFFFF" : "#000000")
    setBgColor(isDark ? "#000000" : "#F3F3F3")
  }, [])

  // Render LaTeX to SVG
  useEffect(() => {
    if (!isMathJaxReady || !latexInput) {
      setPreviewSvg("")
      return
    }

    const renderMath = async () => {
      try {
        // Create a temporary container for MathJax processing
        const tempContainer = document.createElement('div')
        tempContainer.innerHTML = `$$${latexInput}$$`
        tempContainer.style.position = 'absolute'
        tempContainer.style.left = '-9999px'
        tempContainer.style.top = '-9999px'
        document.body.appendChild(tempContainer)

        // Process with MathJax
        await window.MathJax.typesetPromise([tempContainer])
        
        // Extract SVG
        const svgElement = tempContainer.querySelector('svg')
        if (svgElement) {
          // Clone the SVG to avoid reference issues
          const clonedSvg = svgElement.cloneNode(true) as SVGElement

          // Set text color on all relevant SVG elements
          const setFillColor = (el: Element) => {
            // Set fill for text, path, g, use, and tspan elements
            if (["path", "g", "text", "use", "tspan"].includes(el.tagName)) {
              (el as HTMLElement).setAttribute("fill", textColor)
            }
            // Recursively set fill on children
            for (const child of Array.from(el.children)) {
              setFillColor(child)
            }
          }
          setFillColor(clonedSvg)

          // Set background color (for completeness, but SVG bg is handled elsewhere)
          clonedSvg.style.backgroundColor = bgColor

          // Convert to string
          const svgString = new XMLSerializer().serializeToString(clonedSvg)
          setPreviewSvg(svgString)
        }

        // Clean up
        document.body.removeChild(tempContainer)
      } catch (error) {
        console.error('MathJax rendering error:', error)
        framer.notify("Invalid LaTeX equation", { variant: "error", durationMs: 3000 })
      }
    }

    renderMath()
  }, [latexInput, isMathJaxReady, textColor, bgColor])

  // Convert SVG to data URL
  const svgToDataUrl = (svgString: string): string => {
    // Parse the original SVG
    const originalSvg = new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
    const viewBox = originalSvg.getAttribute('viewBox') || '0 0 100 50';
    const [x, y, w, h] = viewBox.split(' ').map(Number);
    // Increase padding to 24px
    const padding = 100;
    const newX = x - padding;
    const newY = y - padding;
    const newW = w + 2 * padding;
    const newH = h + 2 * padding;
    const newViewBox = `${newX} ${newY} ${newW} ${newH}`;
    // Keep a fixed width for display, but scale height to match aspect ratio
    const targetWidth = 300;
    const aspect = newW / newH;
    const targetHeight = Math.round(targetWidth / aspect);

    // Remove width/height attributes from the original SVG content
    originalSvg.removeAttribute('width');
    originalSvg.removeAttribute('height');

    // Create a new SVG wrapper with explicit width/height and viewBox
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', newViewBox);
    svg.setAttribute('width', targetWidth.toString());
    svg.setAttribute('height', targetHeight.toString());
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.style.backgroundColor = bgColor;

    // Insert the original SVG content
    svg.innerHTML = originalSvg.innerHTML;

    // Data URL
    const svgStringWithBackground = svg.outerHTML;
    const encodedSvg = encodeURIComponent(svgStringWithBackground);
    return `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
  };

  // Add LaTeX image to canvas (canvas mode)
  const handleAddLatexImageToCanvas = async () => {
    if (!latexInput.trim()) {
      framer.notify("Please enter a LaTeX equation", { variant: "error", durationMs: 3000 })
      return
    }

    if (!previewSvg) {
      framer.notify("Please wait for equation to render", { variant: "error", durationMs: 3000 })
      return
    }

    try {
      // 1. Parse the SVG to get its natural size
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(previewSvg, "image/svg+xml");
      const svgElement = svgDoc.documentElement;
      const viewBox = svgElement.getAttribute("viewBox");

      let frameWidth = 600;
      let frameHeight = 200;
      if (viewBox) {
        const [, , w, h] = viewBox.split(" ").map(Number);
        // Optional: scale up/down
        const scale = 0.1;
        frameWidth = w * scale;
        frameHeight = h * scale;
      }

      // 2. Upload the image
      const image = await framer.uploadImage({
        image: svgToDataUrl(previewSvg),
        altText: latexInput
      })

      // 3. Create the frame node with dynamic size
      const frame = await framer.createFrameNode({
        width: `${frameWidth}px`,
        height: `${frameHeight}px`,
        name: "Equation Frame",
        backgroundImage: image
      });

      if (!frame) {
        framer.notify("Failed to create frame", { variant: "error", durationMs: 3000 });
        return;
      }

      // 4. Select the frame node by its ID
      if (frame.id) {
        await framer.setSelection([frame.id]);
      } else {
        framer.notify("Frame node has no ID", { variant: "error", durationMs: 3000 });
        return;
      }

      framer.notify("Equation added to canvas", { variant: "success", durationMs: 3000 });
    } catch (err) {
      console.error("Failed to add LaTeX image:", err)
      framer.notify("Failed to add image to canvas", { variant: "error", durationMs: 3000 })
    }
  }

  // Set LaTeX image (image mode)
  const handleSetLatexImage = async () => {
    if (!latexInput.trim()) {
      framer.notify("Please enter a LaTeX equation", { variant: "error", durationMs: 3000 })
      return
    }

    if (!previewSvg) {
      framer.notify("Please wait for equation to render", { variant: "error", durationMs: 3000 })
      return
    }

    try {
      // Set the image directly in image mode
      await framer.setImage({
        image: svgToDataUrl(previewSvg),
        altText: latexInput
      })
      framer.notify("Equation image set", { variant: "success", durationMs: 3000 });
    } catch (err) {
      console.error("Failed to set LaTeX image:", err)
      framer.notify("Failed to set image", { variant: "error", durationMs: 3000 })
    }
  }

  // Main handler that delegates based on mode
  const handleSubmit = async () => {
    if (pluginMode === "image") {
      await handleSetLatexImage()
    } else {
      await handleAddLatexImageToCanvas()
    }
  }

  return (
    <main>
      <div className="input-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p>
            {pluginMode === "image" 
              ? "Create a LaTeX equation image to use in your design."
              : "Convert LaTeX expressions into images for your website."
            }
          </p>
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
              style={{ 
                color: textColor, 
                backgroundColor: bgColor,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '60px'
              }}
              dangerouslySetInnerHTML={{ __html: previewSvg }}
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
        </div>

        <button 
          className="submit" 
          onClick={handleSubmit}
          disabled={!isMathJaxReady || !previewSvg}
        >
          {!isMathJaxReady 
            ? "Loading..." 
            : pluginMode === "image" 
              ? "Use Equation" 
              : "Add to Canvas"
          }
        </button>
      </div>
    </main>
  )
}