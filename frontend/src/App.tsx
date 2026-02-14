import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout';
import { PreprocessingPage } from './pages/Preprocessing';
import { VisualizationPage } from './pages/Visualization';
import { ExportPage } from './pages/Export';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 主应用 */}
        <Route path="/" element={<MainLayout />}>
          {/* 工作区和预处理已合并，默认进入预处理页面 */}
          <Route index element={<PreprocessingPage />} />
          <Route path="preprocessing" element={<Navigate to="/" replace />} />
          <Route path="visualization" element={<VisualizationPage />} />
          <Route path="export" element={<ExportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
