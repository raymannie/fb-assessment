import { SettingsIcon } from 'lucide-react'
import { useId, useSyncExternalStore } from 'react'

import { baseApi } from '@/api/baseApi'
import { useAppDispatch } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import {
  getMockConfig,
  type MockConfig,
  resetMockConfig,
  setMockConfig,
  subscribeMockConfig,
} from './config'
import { resetDb } from './db'

const PRESETS: { label: string; patch: Partial<MockConfig> }[] = [
  {
    label: 'Normal',
    patch: {
      latencyMs: [200, 800],
      failureRate: 0,
      transferFailureRate: 0,
      transferTimeoutRate: 0,
    },
  },
  { label: 'Slow 3G', patch: { latencyMs: [2000, 5000], failureRate: 0.05 } },
  { label: 'Flaky', patch: { latencyMs: [300, 1500], failureRate: 0.3, transferFailureRate: 0.3 } },
  { label: 'Timeouts', patch: { transferTimeoutRate: 1, timeoutMode: 'committed' } },
]

function percent(rate: number): string {
  return String(Math.round(rate * 100))
}

/**
 * Dev-only floating panel to change mock API behaviour at runtime (persisted in sessionStorage).
 * Not rendered in production builds unless VITE_MOCK_PANEL=true.
 */
export default function DevSettingsPanel() {
  const config = useSyncExternalStore(subscribeMockConfig, getMockConfig, getMockConfig)
  const dispatch = useAppDispatch()
  const id = useId()

  const rateField = (
    key: 'failureRate' | 'transferFailureRate' | 'transferTimeoutRate',
    label: string,
  ) => (
    <div className="grid grid-cols-[1fr_5.5rem] items-center gap-2">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          id={`${id}-${key}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={5}
          value={percent(config[key])}
          onChange={(e) => setMockConfig({ [key]: Number(e.target.value) / 100 })}
          className="h-9 text-right"
        />
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          %
        </span>
      </div>
    </div>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="fixed right-4 bottom-24 z-40 shadow-md sm:bottom-4"
          aria-label="Mock API settings"
          title="Mock API settings (dev only)"
        >
          <SettingsIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-80 space-y-4"
        aria-label="Mock API settings"
      >
        <div>
          <h2 className="text-sm font-semibold">Mock API settings</h2>
          <p className="text-muted-foreground text-xs">
            Dev only. Persisted for this tab in sessionStorage.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Presets">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMockConfig(preset.patch)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2">
            <span id={`${id}-latency`} className="text-sm font-medium">
              Latency (ms)
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              aria-labelledby={`${id}-latency`}
              aria-label="Latency minimum (ms)"
              value={config.latencyMs[0]}
              onChange={(e) =>
                setMockConfig({ latencyMs: [Number(e.target.value), config.latencyMs[1]] })
              }
              className="h-9 text-right"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              aria-labelledby={`${id}-latency`}
              aria-label="Latency maximum (ms)"
              value={config.latencyMs[1]}
              onChange={(e) =>
                setMockConfig({ latencyMs: [config.latencyMs[0], Number(e.target.value)] })
              }
              className="h-9 text-right"
            />
          </div>
          {rateField('failureRate', 'Read failure rate')}
          {rateField('transferFailureRate', 'Transfer failure rate')}
          {rateField('transferTimeoutRate', 'Transfer timeout rate')}
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <Label htmlFor={`${id}-mode`}>Timeout mode</Label>
            <select
              id={`${id}-mode`}
              value={config.timeoutMode}
              onChange={(e) =>
                setMockConfig({
                  timeoutMode: e.target.value === 'dropped' ? 'dropped' : 'committed',
                })
              }
              className="border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-3"
            >
              <option value="committed">Committed – debit happens</option>
              <option value="dropped">Dropped – never arrived</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => resetMockConfig()}>
            Reset config
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              resetDb()
              dispatch(baseApi.util.resetApiState())
            }}
          >
            Reset data
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
