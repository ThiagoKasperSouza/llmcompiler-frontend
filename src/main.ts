import './style.css';

interface Activity { id: string; prompt: string; tools: string[]; }
interface Process { id: string; name: string; objective: string; activities: Activity[]; x: number; y: number; }

let processes: Process[] = [{ id: 'p1', name: 'Processo 1', objective: 'Objetivo', activities: [], x: 0, y: 0 }];
let sidebar: Activity[] = [{ id: 'a1', prompt: 'Resuma em 3 bullets...', tools: ['tavily_search', 'summarize'] }];

let zoom = 1;
let panX = 0, panY = 0;
let dragging: string | null = null;
let offset = { x: 0, y: 0 };

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="toolbar">
    <button id="add-process">+ Processo</button>
    <button id="zoom-in">+</button>
    <button id="zoom-out">-</button>
    <button id="reset">Reset</button>
  </div>
  <div class="layout">
    <aside id="sidebar"></aside>
    <main id="canvas"></main>
  </div>
  <button id="import">Importar Lista</button>
  <input type="file" id="file-input" accept=".json" style="display:none" />
  <button id="run">Rodar Workflow</button>
  <pre id="output"></pre>
`;

function renderSidebar() {
  const sb = document.getElementById('sidebar')!;
  sb.innerHTML = '<h3>Atividades</h3>' + sidebar.map(a => `
    <div class="block activity" draggable="true" data-id="${a.id}">
      <input class="prompt-input" value="${a.prompt}" placeholder="Prompt" />
      <input class="tools-input" value="${a.tools.join(',')}" placeholder="tools (comma)" />
    </div>
  `).join('');
}

function renderCanvas() {
  const c = document.getElementById('canvas')!;
  c.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  c.innerHTML = processes.map(p => `
    <div class="block process" data-id="${p.id}" style="left:${p.x}px;top:${p.y}px">
      <button class="delete-btn" data-pid="${p.id}">✕</button>
      <input value="${p.name}" data-field="name" />
      <input value="${p.objective}" data-field="objective" />
      <div class="dropzone" data-pid="${p.id}">
        ${p.activities.map(a => `<div class="block activity"><input class="prompt-input" value="${a.prompt}" /><input class="tools-input" value="${a.tools.join(',')}" /></div>`).join('') || '<span class="empty">Solte atividades aqui</span>'}
      </div>
    </div>
  `).join('');
}

document.getElementById('add-process')!.addEventListener('click', () => {
  processes.push({ id: 'p' + Date.now(), name: 'Novo Processo', objective: '', activities: [], x: 0, y: 0 });
  renderCanvas();
});

document.getElementById('zoom-in')!.addEventListener('click', () => { zoom = Math.min(2, zoom + 0.1); renderCanvas(); });
document.getElementById('zoom-out')!.addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.1); renderCanvas(); });
document.getElementById('reset')!.addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; renderCanvas(); });

document.getElementById('canvas')!.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('process')) {
    dragging = target.dataset.id!;
    const rect = target.getBoundingClientRect();
    offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
});

document.addEventListener('mousemove', (e) => {
  if (dragging) {
    const p = processes.find(x => x.id === dragging)!;
    p.x = (e.clientX - offset.x - panX) / zoom;
    p.y = (e.clientY - offset.y - panY) / zoom;
    renderCanvas();
  }
});

document.addEventListener('mouseup', () => { dragging = null; });

document.getElementById('run')!.addEventListener('click', async () => {
  const result = processes.map(p => p.activities.map(a => [a.prompt, a.tools]));
  document.getElementById('output')!.textContent = JSON.stringify(result, null, 2);
  // Integrar com o proxy
  for (const [prompt, tools] of result.flat()) {
    try {
      const res = await fetch('http://localhost:8000/run_pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, allowed_tools: tools }),
      });
      const data = await res.json();
      console.log('Back response:', data);
      document.getElementById('output')!.textContent += '\n' + JSON.stringify(data, null, 2);
    } catch (err) {
      console.error('Erro ao chamar proxy:', err);
    }
  }
});

document.getElementById('canvas')!.addEventListener('dragover', (e) => { e.preventDefault(); });
document.getElementById('canvas')!.addEventListener('drop', (e) => {
  e.preventDefault();
  const activityId = e.dataTransfer?.getData('text/plain');
  const dropzone = (e.target as HTMLElement).closest('.dropzone') as HTMLElement;
  if (!activityId || !dropzone) return;
  const pid = dropzone.dataset.pid!;
  const activity = sidebar.find(a => a.id === activityId);
  if (!activity) return;
  const proc = processes.find(p => p.id === pid)!;
  proc.activities.push({ ...activity });
  renderCanvas();
});

// dragstart na sidebar
document.getElementById('sidebar')!.addEventListener('dragstart', (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('activity')) {
    e.dataTransfer?.setData('text/plain', target.dataset.id!);
  }
});

document.getElementById('canvas')!.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('delete-btn')) {
    const pid = target.dataset.pid!;
    processes = processes.filter(p => p.id !== pid);
    renderCanvas();
  }
});

document.getElementById('sidebar')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  const container = target.closest('.activity') as HTMLElement;
  if (!container) return;
  const id = container.dataset.id!;
  const activity = sidebar.find(a => a.id === id)!;
  if (target.classList.contains('prompt-input')) activity.prompt = target.value;
  if (target.classList.contains('tools-input')) activity.tools = target.value.split(',').map(s => s.trim()).filter(Boolean);
});

document.getElementById('canvas')!.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  const container = target.closest('.activity') as HTMLElement;
  if (!container) return;
  const dropzone = container.closest('.dropzone') as HTMLElement;
  const pid = dropzone?.dataset.pid;
  if (!pid) return;
  const proc = processes.find(p => p.id === pid)!;
  // encontrar a atividade pelo índice
  const idx = Array.from(dropzone.children).indexOf(container);
  if (idx < 0 || idx >= proc.activities.length) return;
  if (target.classList.contains('prompt-input')) proc.activities[idx].prompt = target.value;
  if (target.classList.contains('tools-input')) proc.activities[idx].tools = target.value.split(',').map(s => s.trim()).filter(Boolean);
});

document.getElementById('import')!.addEventListener('click', () => {
  document.getElementById('file-input')!.click();
});

document.getElementById('file-input')!.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string);
      const raw = Array.isArray(data) ? data : (data.prompts || data.items || []);
      const activities: Activity[] = raw.map((item: any) => {
        if (typeof item === 'string') return { id: 'a' + Date.now() + Math.random(), prompt: item, tools: [] };
        if (Array.isArray(item)) return { id: 'a' + Date.now() + Math.random(), prompt: String(item[0] ?? ''), tools: Array.isArray(item[1]) ? item[1] : [] };
        return { id: 'a' + Date.now() + Math.random(), prompt: String(item.prompt ?? item.text ?? ''), tools: Array.isArray(item.tools) ? item.tools : [] };
      });
      if (processes.length === 0) processes.push({ id: 'p1', name: 'Processo 1', objective: '', activities: [], x: 0, y: 0 });
      processes[0].activities.push(...activities);
      renderCanvas();
    } catch (err) {
      alert('JSON inválido');
    }
  };
  reader.readAsText(file);
});



renderSidebar();
renderCanvas();
