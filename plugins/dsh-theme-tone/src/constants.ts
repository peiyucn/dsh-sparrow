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

/** 边缘折射滤镜（输入框玻璃）：注入一次，CSS 通过 url(#id) 引用。 */
export const LENS_ATTR = 'data-dsh-theme-tone-lens'
export const LENS_FILTER_ID = 'dsh-theme-tone-lens'
/** 滤镜内那张逐像素位移图（`<feImage>`）的 id；canvas 生成后写 href。 */
export const LENS_IMAGE_ID = 'dsh-theme-tone-lens-map'
/** bezel（透镜斜面）宽度：边缘位移向内衰减到 0 的距离，四边相同。 */
export const LENS_BEZEL_PX = 24
/**
 * 边缘处最大位移（CSS px）。位移图编码 128±值；负 scale 让采样点落在卡片**外侧**，
 * 于是边缘把卡外内容折射/放大进来（凸透镜），而不是把卡内内容压向边缘。
 * 必须 < 128，否则 128±值 会撞到 0 / 255 的编码钳制。
 */
export const LENS_DEPTH_PX = 24
/** 位移图通道 → 采样偏移的换算；255 对应 1px 的 128±depth 编码，负号 = 向卡外取样。 */
export const LENS_MAP_SCALE = -255
