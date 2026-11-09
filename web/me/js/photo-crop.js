/** Clamp the square source rectangle to the selected image at every framing position. */
export function cropRectangle(width, height, zoom = 1, horizontal = 0, vertical = 0) {
  const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  const position = value => (Math.max(-100, Math.min(100, value)) + 100) / 200;
  return { x: (width - side) * position(horizontal), y: (height - side) * position(vertical), side };
}
