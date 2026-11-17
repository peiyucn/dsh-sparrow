

export interface RectLike {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}


export interface AnchorPointLike {
  readonly x: number
  readonly y: number
  readonly up: boolean
}


export function rectsEqual(left: RectLike | null, right: RectLike | null): boolean {
  if (left === null || right === null) return left === right
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
}


export function anchorPointsEqual(left: AnchorPointLike | null, right: AnchorPointLike | null): boolean {
  if (left === null || right === null) return left === right
  return left.x === right.x && left.y === right.y && left.up === right.up
}
