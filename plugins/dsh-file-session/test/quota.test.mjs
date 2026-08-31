import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatUsagePercent, storageUsageRatio } from '../lib/client/quota.js'

describe('dsh-file-session 配额纯逻辑', () => {
  describe('storageUsageRatio', () => {
    it('正常用量 应该 返回 used/quota 比例', () => {
      assert.equal(storageUsageRatio(50, 100), 0.5)
      assert.equal(storageUsageRatio(25, 100), 0.25)
    })

    it('超过配额 应该 钳到 1', () => {
      assert.equal(storageUsageRatio(200, 100), 1)
    })

    it('非正输入 应该 返回 0（不除零）', () => {
      assert.equal(storageUsageRatio(0, 100), 0)
      assert.equal(storageUsageRatio(-5, 100), 0)
      assert.equal(storageUsageRatio(50, 0), 0)
      assert.equal(storageUsageRatio(Number.NaN, 100), 0)
      assert.equal(storageUsageRatio(50, Number.NaN), 0)
    })
  })

  describe('formatUsagePercent', () => {
    it('百分比 应该 按量级自适应小数位（25GiB 配额下常见 0.01% 量级）', () => {
      assert.equal(formatUsagePercent(0), '0.0000%')
      assert.equal(formatUsagePercent(0.00005), '0.0050%')
      assert.equal(formatUsagePercent(0.000195), '0.020%')
      assert.equal(formatUsagePercent(0.0053), '0.53%')
      assert.equal(formatUsagePercent(0.05), '5.0%')
      assert.equal(formatUsagePercent(0.092), '9.2%')
    })

    it('不低于 10% 应该 取整', () => {
      assert.equal(formatUsagePercent(0.1), '10%')
      assert.equal(formatUsagePercent(0.555), '56%')
      assert.equal(formatUsagePercent(1), '100%')
    })

    it('越界输入 应该 钳到 [0%, 100%]', () => {
      assert.equal(formatUsagePercent(-0.3), '0.0000%')
      assert.equal(formatUsagePercent(1.7), '100%')
    })
  })
})
