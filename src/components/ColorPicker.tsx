import { COLORS, type Color } from '../engine/types'
import { CARD_COLORS } from './Card'

interface ColorPickerProps {
  onPick: (color: Color) => void
}

export function ColorPicker({ onPick }: ColorPickerProps) {
  return (
    <div className="overlay">
      <div className="modal">
        <h2>Choose a color</h2>
        <div className="color-grid">
          {COLORS.map((c) => (
            <button
              key={c}
              className="color-swatch"
              style={{ background: CARD_COLORS[c] }}
              aria-label={c}
              onClick={() => onPick(c)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
