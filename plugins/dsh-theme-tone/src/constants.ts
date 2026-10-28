export const name = 'dsh-theme-tone'
export const PACKAGE_NAME = '@dsh-sparrow/dsh-theme-tone'
export const SETTINGS_NAMESPACE = name
export const LOCALE_NAMESPACE = 'theme-tone'
export const ROW_SLOT = 'settings.general.item'
export const ROW_ID = 'theme-tone'
export const ROW_ORDER = 10.5

export const MARKER_ATTR = 'data-dsh-theme-tone'
export const PLAIN_ATTR = 'data-dsh-theme-tone-plain'
export const BACKDROP_CLASS = 'dsh-theme-tone'

export const BACKDROP_Z_INDEX = 80
export const CONTENT_Z_INDEX = 81
export const ABOVE_CONTENT_Z_INDEX = 82

export const CONTENT_ATTR = 'data-conversation-scroll'
export const RIGHT_PANEL_ATTR = 'data-sidebar-right-panel'
export const SHELL_OVERLAY_ATTR = 'data-shell-overlay'
export const WIDTH_HANDLE_ATTR = 'data-width-handle'
export const SIDE_ATTR = 'data-side'

export const TOP_VARIABLE = '--dsh-theme-tone-top'
export const BOTTOM_VARIABLE = '--dsh-theme-tone-bottom'
export const LEFT_VARIABLE = '--dsh-theme-tone-left'
export const PANEL_VARIABLE = '--dsh-theme-tone-panel'
export const TOP_STOP_VARIABLE = '--dsh-theme-tone-top-stop'

/** 输入框 bezel 透镜：body 标记 + 滤镜 / 位移图 id。 */
export const LENS_ATTR = 'data-dsh-theme-tone-lens'
export const LENS_FILTER_ID = 'dsh-theme-tone-lens'
export const LENS_IMAGE_ID = 'dsh-theme-tone-lens-map'
/** 斜面宽度（px）。 */
export const LENS_BEZEL_PX = 28
/** 边缘最大位移（px；必须 < 128，编码 128±值会撞到通道上下限）。 */
export const LENS_DEPTH_PX = 32
/** 通道 → 采样偏移：255 对应 1px；正值 = 按位移图朝卡片中心取样（四边向外放大）。 */
export const LENS_MAP_SCALE = 255
