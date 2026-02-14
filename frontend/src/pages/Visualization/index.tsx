import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Camera } from 'lucide-react';
import { Alert, Button, Card, CardTitle } from '../../components/ui';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ROISelector } from './ROISelector';
import { ERPChart, PSDChart, TopoChart, TFRChart } from './Charts';
import { TopoAnimationChart } from './TopoAnimationChart';
import { useEEGStore } from '../../stores/eegStore';

export function VisualizationPage() {
  const DEFAULT_CENTRAL_ROI = ['C3', 'C4', 'Cz'];
  const { 
    selectedROI, 
    setSelectedROI, 
    displayMode, 
    setDisplayMode, 
    chartType, 
    setChartType,
    sessionId,
    currentData
  } = useEEGStore();
  
  // Topomap 参数
  const [topoMode, setTopoMode] = useState<'potential' | 'power'>('potential');
  const [topoStyle, setTopoStyle] = useState<'canvas' | 'mne'>('canvas'); // 新增：地形图风格
  const [topoTimePoint, setTopoTimePoint] = useState(350);
  const [topoFreqBand, setTopoFreqBand] = useState<'theta' | 'alpha' | 'beta' | 'custom'>('alpha');
  const [topoFreqMin, setTopoFreqMin] = useState(8);
  const [topoFreqMax, setTopoFreqMax] = useState(12);
  // 预留给将来使用的时间窗口参数
  const [_topoTimeWinStart, _setTopoTimeWinStart] = useState(0);
  const [_topoTimeWinEnd, _setTopoTimeWinEnd] = useState(0);
  void _topoTimeWinStart; void _setTopoTimeWinStart;
  void _topoTimeWinEnd; void _setTopoTimeWinEnd;

  // 动画参数
  const [animationMode, setAnimationMode] = useState(false);
  const [animStartTime, setAnimStartTime] = useState(-200);
  const [animEndTime, setAnimEndTime] = useState(800);
  const [animFrameInterval, setAnimFrameInterval] = useState(20); // 帧间隔（ms）

  // PSD 参数
  const [psdFmin, setPsdFmin] = useState(1);
  const [psdFmax, setPsdFmax] = useState(50);
  const defaultAppliedSessionRef = useRef<string | null>(null);

  // 导出：由当前图表注册一个导出函数
  const exportFnRef = useRef<null | (() => void)>(null);
  const registerExport = (fn: () => void) => {
    exportFnRef.current = fn;
  };

  useEffect(() => {
    // 切换tab时避免导出旧的图
    exportFnRef.current = null;
  }, [chartType]);

  useEffect(() => {
    if (!sessionId || !currentData) {
      defaultAppliedSessionRef.current = null;
      return;
    }

    // 每个会话仅设置一次默认展示，避免覆盖用户后续手动选择
    if (defaultAppliedSessionRef.current === sessionId) {
      return;
    }

    const availableEegChannels = currentData.channels
      .filter(ch => ch.type === 'EEG' && !ch.isBad)
      .map(ch => ch.name);
    const centralChannels = DEFAULT_CENTRAL_ROI.filter(ch => availableEegChannels.includes(ch));

    if (centralChannels.length > 0) {
      setSelectedROI(centralChannels);
    }
    setDisplayMode('average');
    defaultAppliedSessionRef.current = sessionId;
  }, [sessionId, currentData, setDisplayMode, setSelectedROI]);

  return (
    <div className="h-full flex">
      {/* 左侧：视图配置 */}
      <div className="w-72 border-r border-eeg-border bg-eeg-surface p-4 overflow-auto">
        <h2 className="text-sm font-semibold text-eeg-text mb-4">视图配置</h2>

        {/* ROI 选择器 */}
        <Card className="mb-4">
          <CardTitle className="text-sm">ROI 选择器</CardTitle>
          <div className="mt-3">
            <ROISelector
              selectedChannels={selectedROI}
              onSelectionChange={setSelectedROI}
            />
          </div>
        </Card>

        {/* 显示模式（地形图模式下不显示） */}
        {chartType !== 'topo' && (
          <Card className="mb-4">
            <CardTitle className="text-sm">显示模式</CardTitle>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="displayMode"
                  checked={displayMode === 'butterfly'}
                  onChange={() => setDisplayMode('butterfly')}
                  className="w-4 h-4 text-eeg-active focus:ring-eeg-active"
                />
                <span className="text-sm text-eeg-text">多通道视图 </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="displayMode"
                  checked={displayMode === 'average'}
                  onChange={() => setDisplayMode('average')}
                  className="w-4 h-4 text-eeg-active focus:ring-eeg-active"
                />
                <span className="text-sm text-eeg-text">平均图</span>
              </label>
            </div>
          </Card>
        )}

        {/* 图表参数 */}
        <Card>
          <CardTitle className="text-sm">图表参数</CardTitle>
          <div className="mt-3">
            <Tabs.Root value={chartType} onValueChange={(v) => setChartType(v as any)}>
              <Tabs.List className="flex border-b border-eeg-border mb-3">
                {['erp', 'psd', 'topo', 'tfr'].map((type) => (
                  <Tabs.Trigger
                    key={type}
                    value={type}
                    className="flex-1 py-1.5 text-xs font-medium text-eeg-text-muted hover:text-eeg-text data-[state=active]:text-eeg-accent data-[state=active]:border-b-2 data-[state=active]:border-eeg-accent uppercase"
                  >
                    {type}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content value="erp">
                <p className="text-xs text-eeg-text-muted">ERP 显示已固定为主曲线</p>
              </Tabs.Content>

              <Tabs.Content value="topo">
                <div className="space-y-3">
                  {/* 渲染风格 */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-eeg-text-muted w-8">风格</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="topoStyle" checked={topoStyle === 'canvas'} onChange={() => setTopoStyle('canvas')} className="w-3.5 h-3.5" />
                      <span className="text-sm text-eeg-text">Canvas</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="topoStyle" checked={topoStyle === 'mne'} onChange={() => setTopoStyle('mne')} className="w-3.5 h-3.5" />
                      <span className="text-sm text-eeg-text">MNE</span>
                    </label>
                  </div>

                  {/* 显示模式 */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-eeg-text-muted w-8">模式</span>
                    <label className={`flex items-center gap-1.5 ${!currentData?.hasEpochs ? 'opacity-40' : 'cursor-pointer'}`}>
                      <input type="radio" name="topoMode" checked={topoMode === 'potential'} onChange={() => setTopoMode('potential')} disabled={!currentData?.hasEpochs} className="w-3.5 h-3.5" />
                      <span className="text-sm text-eeg-text">电位</span>
                    </label>
                    <label className={`flex items-center gap-1.5 ${!currentData?.hasEpochs ? 'opacity-40' : 'cursor-pointer'}`}>
                      <input type="radio" name="topoMode" checked={topoMode === 'power'} onChange={() => setTopoMode('power')} disabled={!currentData?.hasEpochs} className="w-3.5 h-3.5" />
                      <span className="text-sm text-eeg-text">功率</span>
                    </label>
                  </div>

                  {!currentData?.hasEpochs && (
                    <Alert variant="warning" title="提示" description="需要先分段" className="text-xs" />
                  )}

                  {/* 电位地形图参数 */}
                  {topoMode === 'potential' && currentData?.hasEpochs && (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={animationMode} onChange={(e) => setAnimationMode(e.target.checked)} className="w-4 h-4 rounded" />
                        <span className="text-sm text-eeg-text">动画模式</span>
                      </label>

                      {!animationMode ? (
                        <div>
                          <label className="block text-xs text-eeg-text-muted mb-1">时间点 (ms)</label>
                          <input type="number" value={topoTimePoint} onChange={(e) => setTopoTimePoint(parseFloat(e.target.value) || 350)} step="10" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-eeg-text-muted mb-1">起始</label>
                            <input type="number" value={animStartTime} onChange={(e) => setAnimStartTime(parseFloat(e.target.value) || -200)} step="50" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
                          </div>
                          <div>
                            <label className="block text-xs text-eeg-text-muted mb-1">结束</label>
                            <input type="number" value={animEndTime} onChange={(e) => setAnimEndTime(parseFloat(e.target.value) || 800)} step="50" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
                          </div>
                          <div>
                            <label className="block text-xs text-eeg-text-muted mb-1">间隔</label>
                            <input type="number" value={animFrameInterval} onChange={(e) => setAnimFrameInterval(parseFloat(e.target.value) || 20)} min="10" max="100" step="10" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* 功率地形图参数 */}
                  {topoMode === 'power' && currentData?.hasEpochs && (
                    <>
                      <div>
                        <label className="block text-xs text-eeg-text-muted mb-1">频段</label>
                        <select value={topoFreqBand} onChange={(e) => {
                          const band = e.target.value as 'theta' | 'alpha' | 'beta' | 'custom';
                          setTopoFreqBand(band);
                          if (band === 'theta') { setTopoFreqMin(4); setTopoFreqMax(8); }
                          else if (band === 'alpha') { setTopoFreqMin(8); setTopoFreqMax(12); }
                          else if (band === 'beta') { setTopoFreqMin(12); setTopoFreqMax(30); }
                        }} className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text">
                          <option value="theta">Theta (4-8 Hz)</option>
                          <option value="alpha">Alpha (8-12 Hz)</option>
                          <option value="beta">Beta (12-30 Hz)</option>
                          <option value="custom">自定义</option>
                        </select>
                      </div>
                      {topoFreqBand === 'custom' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-eeg-text-muted mb-1">fmin (Hz)</label>
                            <input type="number" value={topoFreqMin} onChange={(e) => setTopoFreqMin(parseFloat(e.target.value) || 1)} min="0.5" step="0.5" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
                          </div>
                          <div>
                            <label className="block text-xs text-eeg-text-muted mb-1">fmax (Hz)</label>
                            <input type="number" value={topoFreqMax} onChange={(e) => setTopoFreqMax(parseFloat(e.target.value) || 12)} min="1" step="1" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Tabs.Content>

              <Tabs.Content value="psd">
                <div className="space-y-3">
                  {/* 频率范围 */}
                  <div>
                    <label className="block text-xs text-eeg-text-muted mb-2 font-medium">频率范围</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-eeg-text-muted mb-1">最小频率 (Hz)</label>
                        <input
                          type="number"
                          value={psdFmin}
                          onChange={(e) => setPsdFmin(parseFloat(e.target.value) || 1)}
                          min="0.5"
                          max="50"
                          step="0.5"
                          className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-eeg-text-muted mb-1">最大频率 (Hz)</label>
                        <input
                          type="number"
                          value={psdFmax}
                          onChange={(e) => setPsdFmax(parseFloat(e.target.value) || 50)}
                          min="10"
                          max="100"
                          step="1"
                          className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Tabs.Content>

              <Tabs.Content value="tfr">
                <p className="text-xs text-eeg-text-muted">参数设置在右侧面板</p>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </Card>
      </div>

      {/* 右侧：图表展示区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部工具栏 */}
        <div className="h-12 border-b border-eeg-border bg-eeg-surface px-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-eeg-text">
            {chartType === 'erp' && 'ERP 波形图'}
            {chartType === 'psd' && '功率谱密度 (PSD)'}
            {chartType === 'topo' && '功率地形图'}
            {chartType === 'tfr' && '时频分析 (TFR)'}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportFnRef.current?.()}
              disabled={!exportFnRef.current}
            >
              <Camera size={16} className="mr-1.5" />
              导出图片
            </Button>
            <ThemeToggleButton />
          </div>
        </div>

        {/* 图表区域 */}
        <div className="flex-1 p-4 min-h-0">
          <div className="h-full bg-eeg-surface rounded-lg border border-eeg-border overflow-auto shadow-sm shadow-[var(--color-eeg-shadow)]">
            <ErrorBoundary>
              {chartType === 'erp' && (
                <ERPChart 
                  sessionId={sessionId}
                  channels={selectedROI.length > 0 
                    ? selectedROI 
                    : (currentData?.channels?.filter(ch => ch.type === 'EEG' && !ch.isBad).map(ch => ch.name) || [])}
                  displayMode={displayMode}
                  onRegisterExport={registerExport}
                />
              )}
              {chartType === 'psd' && (
                <PSDChart 
                  sessionId={sessionId}
                  channels={selectedROI.length > 0 
                    ? selectedROI 
                    : (currentData?.channels?.filter(ch => ch.type === 'EEG' && !ch.isBad).map(ch => ch.name) || [])}
                  displayMode={displayMode}
                  fmin={psdFmin}
                  fmax={psdFmax}
                  onRegisterExport={registerExport}
                />
              )}
              {chartType === 'topo' && (
                <>
                  {topoMode === 'potential' && animationMode ? (
                    // 动画模式：显示动画组件
                    <TopoAnimationChart
                      sessionId={sessionId}
                      startTime={animStartTime}
                      endTime={animEndTime}
                      frameInterval={animFrameInterval}
                      renderStyle={topoStyle}
                      onRegisterExport={registerExport}
                    />
                  ) : (
                    // 单帧模式：显示标准地形图
                    <TopoChart
                      sessionId={sessionId}
                      mode={topoMode}
                      timePoint={topoTimePoint}
                      freqBand={topoMode === 'power' ? [topoFreqMin, topoFreqMax] : undefined}
                      renderStyle={topoStyle}
                      onRegisterExport={registerExport}
                    />
                  )}
                </>
              )}
              {chartType === 'tfr' && <TFRChart onRegisterExport={registerExport} />}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
