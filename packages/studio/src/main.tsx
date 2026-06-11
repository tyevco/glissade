import { loadYogaLayoutEngine } from '@glissade/scene/layout';
import { createRoot } from 'react-dom/client';

await loadYogaLayoutEngine(); // corpus contains flexbox scenes
import { App } from './App.js';
import './studio.css';

createRoot(document.getElementById('root')!).render(<App />);
