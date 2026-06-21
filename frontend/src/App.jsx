import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Learn from './pages/Learn';
import Analyze from './pages/Analyze';
import Scan from './pages/Scan';

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Navigate to="/learn" replace />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/analyze" element={<Analyze />} />
        <Route path="/scan" element={<Scan />} />
      </Routes>
    </BrowserRouter>
  );
}
