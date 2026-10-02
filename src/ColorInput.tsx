import { useRef } from "react"

export function ColorInput({
    value,
    onChange,
    erasable = false,
    label = "Color",
}: {
    value: string | false
    onChange?: (value: string | false) => void
    erasable?: boolean
    label?: string
}) {
    const inputRef = useRef<HTMLInputElement>(null)

    return (
        <div
            className="color-input"
            onClick={e => {
                if (e.target === inputRef.current) return
                inputRef.current?.click()
                if (!value) {
                    onChange?.("#000000")
                }
            }}
        >
            <input
                ref={inputRef}
                type="color"
                aria-label={label}
                value={value || "#000000"}
                onClick={() => {
                    if (!value) onChange?.("#000000")
                }}
                onChange={e => {
                    const value = e.target.value
                    onChange?.(value)
                }}
            />
            {value ? <span className="color">{value}</span> : <span className="placeholder">{erasable ? "Transparent" : "Add..."}</span>}
            {value && erasable && (
                <div
                    className="erase"
                    role="button"
                    tabIndex={0}
                    aria-label="Make background transparent"
                    onClick={e => {
                        e.stopPropagation()
                        onChange?.(false)
                    }}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            e.stopPropagation()
                            onChange?.(false)
                        }
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">
                        <path
                            d="M 1.5 6.5 L 6.5 1.5"
                            fill="transparent"
                            strokeWidth="1.5"
                            stroke="currentColor"
                            strokeLinecap="round"
                        ></path>
                        <path
                            d="M 6.5 6.5 L 1.5 1.5"
                            fill="transparent"
                            strokeWidth="1.5"
                            stroke="currentColor"
                            strokeLinecap="round"
                        ></path>
                    </svg>
                </div>
            )}
        </div>
    )
}
