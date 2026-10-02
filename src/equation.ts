export interface EquationImage {
  svg: string
  dataUrl: string
  width: number
  height: number
}

// Use one padded SVG and one set of dimensions for preview, image mode, and canvas.
export function createEquationImage(
  source: SVGElement,
  textColor: string,
  backgroundColor: string | false,
): EquationImage {
  const svg = source.cloneNode(true) as SVGElement
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number)
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite)) {
    throw new Error("The equation has invalid dimensions.")
  }
  const [x, y, width, height] = viewBox
  if (width <= 0 || height <= 0) throw new Error("The equation has invalid dimensions.")

  const padding = 100
  const paddedWidth = width + padding * 2
  const paddedHeight = height + padding * 2
  const imageWidth = 300
  const imageHeight = Math.max(1, Math.round(imageWidth * paddedHeight / paddedWidth))

  // XMLSerializer writes the root namespace. A plain xmlns attribute duplicates it.
  svg.removeAttribute("xmlns")
  svg.setAttribute("viewBox", `${x - padding} ${y - padding} ${paddedWidth} ${paddedHeight}`)
  svg.setAttribute("width", String(imageWidth))
  svg.setAttribute("height", String(imageHeight))
  svg.setAttribute("color", textColor)
  svg.style.color = textColor
  svg.style.removeProperty("background-color")
  // MathJax's inline vertical alignment applies to surrounding text, not an image.
  svg.style.removeProperty("vertical-align")

  if (backgroundColor) {
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    background.setAttribute("x", String(x - padding))
    background.setAttribute("y", String(y - padding))
    background.setAttribute("width", String(paddedWidth))
    background.setAttribute("height", String(paddedHeight))
    background.setAttribute("fill", backgroundColor)
    svg.insertBefore(background, svg.firstChild)
  }

  const serialized = new XMLSerializer().serializeToString(svg)
  return {
    svg: serialized,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`,
    width: imageWidth,
    height: imageHeight,
  }
}
