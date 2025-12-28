import { Component, ElementRef, ViewChild, ChangeDetectionStrategy, HostListener, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// --- Interfaces ---

interface Point {
  x: number;
  y: number;
}

interface FsmNode {
  id: string;
  x: number; // World Coordinate
  y: number; // World Coordinate
  size: number;
  label: string;
  isStart: boolean;
  isEnd: boolean;
}

interface FsmLink {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  controlPoint: Point; // World Coordinate
  spread?: number;
}

interface GraphData {
    nodes: FsmNode[];
    links: FsmLink[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col fixed inset-0 h-[100dvh] w-screen bg-slate-50 font-sans selection:bg-blue-100 text-slate-800 select-none overflow-hidden touch-manipulation">

      <!-- Toolbar -->
      <header class="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shadow-sm z-[100] shrink-0 h-16 overflow-x-auto no-scrollbar">

      <div class="flex items-center gap-1 md:gap-4 min-w-max">

            <!-- Mobile Toggle Sidebar -->
             <div class="flex items-center gap-1">
            <button (click)="isSidebarOpen.set(!isSidebarOpen())"
                    class="lg:hidden p-1 rounded-lg border border-slate-300 h-9 min-w-[40px]"
                    [class.bg-indigo-100]="!isSidebarOpen() && (selectedNode() || selectedLink())"
                    [class.text-indigo-700]="!isSidebarOpen() && (selectedNode() || selectedLink())"
                    [class.bg-slate-100]="!(!isSidebarOpen() && (selectedNode() || selectedLink()))"
                    [class.text-slate-600]="!(!isSidebarOpen() && (selectedNode() || selectedLink()))">
                <!-- Change icon based on state: Close(X) / Edit(Pencil) / Settings(Gear) -->
                {{ isSidebarOpen() ? '✕' : (selectedNode() || selectedLink() ? '✏️' : '⚙️') }}
            </button>
             </div>

          <!-- State Actions Group -->
          <div class="flex items-center gap-1">
            <button (click)="addNode()" class="btn-tool btn-outline-indigo flex items-center gap-2">
              <span class="text-lg leading-none">+</span> <span class="hidden sm:inline">Add State</span>
            </button>
            <button (click)="deleteSelected()"
                    [disabled]="!selectedNode() && !selectedLink()"
                    class="btn-tool btn-outline-rose flex items-center gap-2">
              <span class="text-lg leading-none">🗑️</span> <span class="hidden sm:inline">Delete</span>
            </button>
          </div>

          <!-- Mode Toggles -->
          <div class="hidden md:flex bg-slate-200/80 p-1 rounded-lg border border-slate-300 h-9">
            <button
                class="px-4 rounded-md text-xs font-bold flex items-center gap-1 transition-all duration-200 h-full"
                [class.bg-indigo-600]="interactionMode() === 'select'"
                [class.text-white]="interactionMode() === 'select'"
                [class.shadow-md]="interactionMode() === 'select'"
                [class.text-slate-600]="interactionMode() !== 'select'"
                [class.hover:bg-slate-300]="interactionMode() !== 'select'"
                (click)="setMode('select')">
               ✋ <span>Move</span>
            </button>
            <button
                class="px-4 rounded-md text-xs font-bold flex items-center gap-1 transition-all duration-200 h-full"
                [class.bg-indigo-600]="interactionMode() === 'connect'"
                [class.text-white]="interactionMode() === 'connect'"
                [class.shadow-md]="interactionMode() === 'connect'"
                [class.text-slate-600]="interactionMode() !== 'connect'"
                [class.hover:bg-slate-300]="interactionMode() !== 'connect'"
                (click)="setMode('connect')">
               🔗 <span>Connect</span>
            </button>
          </div>

           <div class="flex items-center gap-1">
              <button (click)="resetView()" class="btn-tool btn-outline-amber flex items-center gap-2">
                <span class="text-lg leading-none">🏠</span> <span class="hidden sm:inline">Center</span>
              </button>
            </div>

          <!-- Undo / Redo Group -->
          <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 h-9 mr-2">
            <button (click)="undo()" [disabled]="historyPast.length === 0"
                    class="w-8 h-full flex items-center justify-center rounded hover:bg-white transition-colors text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent" title="Undo (Ctrl+Z)">
              ↩️
            </button>
            <div class="w-px h-4 bg-slate-300"></div>
            <button (click)="redo()" [disabled]="historyFuture.length === 0"
                    class="w-8 h-full flex items-center justify-center rounded hover:bg-white transition-colors text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent" title="Redo (Ctrl+Y)">
              ↪️
            </button>
          </div>

        </div>
      </header>

      <!-- Main Area -->
      <div class="flex-grow flex overflow-hidden relative">

        <!-- Canvas Area -->
        <div #canvasContainer
             class="flex-grow relative bg-slate-100 touch-none overflow-hidden shadow-inner select-none"
             [class.cursor-grab]="!isDraggingNode && !isDraggingLineBody && !connectSourceId && !isPanning"
             [class.cursor-grabbing]="isPanning"
             (mousedown)="onCanvasMouseDown($event)"
             (mousemove)="onCanvasMouseMove($event)"
             (touchstart)="onTouchStart($event)"
             (touchmove)="onTouchMove($event)"
             (touchend)="onTouchEnd($event)"
             (wheel)="onWheel($event)"
             (dragstart)="$event.preventDefault()">

            <!-- Grid Background -->
            <div class="absolute inset-0 opacity-[0.03] pointer-events-none"
                 [style.background-position]="viewOffset().x + 'px ' + viewOffset().y + 'px'"
                 [style.background-size]="(20 * zoomLevel()) + 'px ' + (20 * zoomLevel()) + 'px'"
                 style="background-image: radial-gradient(#000 1px, transparent 1px);">
            </div>

            <!-- SVG Layer -->
            <svg #svgElement class="w-full h-full absolute top-0 left-0 pointer-events-none overflow-visible"
                 xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4"
                        refX="5.5" refY="2" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,2 L0,4 Z" fill="#64748b" />
                </marker>
                <marker id="arrowhead-selected" markerWidth="6" markerHeight="4"
                        refX="5.5" refY="2" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,2 L0,4 Z" fill="#3b82f6" />
                </marker>
            </defs>

            <g [attr.transform]="'translate(' + viewOffset().x + ',' + viewOffset().y + ') scale(' + zoomLevel() + ')'">
                <!-- LINKS -->
                 @for (link of links(); track link.id) {
                <g class="pointer-events-auto">
                    <path
                    [attr.d]="getLinkPath(link)"
                    fill="none"
                    [attr.stroke]="selectedLink()?.id === link.id ? '#3b82f6' : '#64748b'"
                    [attr.stroke-width]="selectedLink()?.id === link.id ? 3 : 2"
                    [attr.marker-end]="selectedLink()?.id === link.id ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'"
                    />

                    <g class="cursor-move"
                       (mousedown)="startDragLine(link, $event)"
                       (touchstart)="startDragLine(link, $event)"
                       (dblclick)="onLinkDoubleClick(link, $event)">
                        <path
                            [attr.d]="getLinkPath(link)"
                            fill="none"
                            stroke="transparent"
                            [attr.stroke-width]="24 / zoomLevel()"
                        />
                        <!-- Label -->
                      @if (getLabelPos(link); as pos) {
                        <g>
                            <rect
                                [attr.x]="pos.x - (link.label.length * 4) - 8"
                                [attr.y]="pos.y - 12"
                                [attr.width]="(link.label.length * 8) + 16"
                                height="24"
                                rx="6"
                                fill="white"
                                [attr.stroke]="selectedLink()?.id === link.id ? '#3b82f6' : '#cbd5e1'"
                                [attr.stroke-width]="selectedLink()?.id === link.id ? 2 : 1"
                                class="shadow-sm"
                            />
                            <text
                            [attr.x]="pos.x"
                            [attr.y]="pos.y"
                            [attr.font-size]="12"
                            text-anchor="middle"
                            dominant-baseline="middle"
                            class="font-bold fill-slate-700 select-none font-mono">
                            {{ link.label }}
                            </text>
                        </g>
                      }
                    </g>
                </g>
              }

                <!-- Temp Line -->
              @if (tempLink()) {
                <line
                    [attr.x1]="tempLink()!.x1"
                    [attr.y1]="tempLink()!.y1"
                    [attr.x2]="tempLink()!.x2"
                    [attr.y2]="tempLink()!.y2"
                    stroke="#94a3b8"
                    stroke-width="2"
                    stroke-dasharray="5,5"
                    class="pointer-events-none"
                />
               }
            </g>
            </svg>

            <!-- NODES -->
             @for (node of nodes(); track node.id) {
            <div
                class="absolute flex items-center justify-center rounded-full border-2 shadow-sm pointer-events-auto box-border transition-shadow"
                [style.width.px]="node.size"
                [style.height.px]="node.size"
                [style.transform]="'translate(' + (node.x * zoomLevel() + viewOffset().x) + 'px,' + (node.y * zoomLevel() + viewOffset().y) + 'px) translate(-50%, -50%) scale(' + zoomLevel() + ')'"
                [class.border-slate-600]="!node.isStart && !node.isEnd && selectedNode()?.id !== node.id"
                [class.border-green-600]="node.isStart"
                [class.bg-green-50]="node.isStart"
                [class.text-green-800]="node.isStart"
                [class.border-red-600]="node.isEnd"
                [class.bg-red-50]="node.isEnd"
                [class.text-red-800]="node.isEnd"
                [class.border-double]="node.isEnd"
                [class.border-4]="node.isEnd"
                [class.ring-2]="selectedNode()?.id === node.id"
                [class.ring-blue-500]="selectedNode()?.id === node.id"
                [class.ring-offset-2]="selectedNode()?.id === node.id"
                [class.bg-white]="!node.isStart && !node.isEnd"
                [class.z-40]="selectedNode()?.id === node.id"
                (mousedown)="onNodeMouseDown(node, $event)"
                (touchstart)="onNodeMouseDown(node, $event)"
                (dblclick)="onNodeDoubleClick(node, $event)">

              <div class="text-[11px] font-bold text-center break-words overflow-hidden px-2 py-1 max-w-full leading-tight pointer-events-none">
                  {{ node.label }}
              </div>
              </div>
             }

            <!-- Floating Zoom Controls (Desktop Only - hidden on mobile) -->
            <div class="hidden md:flex absolute right-6 bottom-6 flex-col bg-white/90 backdrop-blur-sm border-2 border-slate-200 shadow-xl rounded-xl z-[80] overflow-hidden">
                <button (click)="zoomIn()" class="w-10 h-10 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xl border-b border-slate-100 transition-colors" title="Zoom In">+</button>
                <button (click)="resetZoom()" class="w-10 h-10 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 text-[10px] font-mono font-bold text-slate-500 border-b border-slate-100 transition-colors" title="Reset Zoom">{{ zoomPercent() }}%</button>
                <button (click)="zoomOut()" class="w-10 h-10 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xl transition-colors" title="Zoom Out">-</button>
            </div>

        </div>

        <!-- Mobile Floating Action Bar (Bottom Center) -->
        <div class="md:hidden absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[80] flex bg-white/90 backdrop-blur-sm p-1.5 rounded-2xl border-2 border-slate-200 shadow-xl gap-2">
            <button
                class="px-6 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-all shadow-sm"
                [class.bg-indigo-600]="interactionMode() === 'select'"
                [class.text-white]="interactionMode() === 'select'"
                [class.bg-white]="interactionMode() !== 'select'"
                [class.text-slate-500]="interactionMode() !== 'select'"
                (click)="setMode('select')">
               <span class="text-xl leading-none">✋</span> Move
            </button>
            <button
                class="px-6 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-all shadow-sm"
                [class.bg-indigo-600]="interactionMode() === 'connect'"
                [class.text-white]="interactionMode() === 'connect'"
                [class.bg-white]="interactionMode() !== 'connect'"
                [class.text-slate-500]="interactionMode() !== 'connect'"
                (click)="setMode('connect')">
               <span class="text-xl leading-none">🔗</span> Connect
            </button>
        </div>

        <!-- Sidebar (Drawer on mobile) -->
        <aside class="fixed lg:static top-16 bottom-0 right-0 w-80 bg-white border-l border-slate-200 flex flex-col shadow-2xl lg:shadow-xl z-[90] transition-transform duration-300 transform"
               [class.translate-x-full]="!isSidebarOpen() && !isLargeScreen()"
               [class.translate-x-0]="isSidebarOpen() || isLargeScreen()">

            <div class="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Properties</h2>
                <button (click)="isSidebarOpen.set(false)" class="lg:hidden text-slate-400 p-2">✕</button>
            </div>

            <div class="p-5 flex-grow overflow-y-auto space-y-6">
                <div class="space-y-2 pb-4 border-b border-slate-100">

                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-2">Project</div>
                    <button (click)="newDiagram()" class="w-full mb-2 px-3 py-2 bg-white border border-rose-200 text-rose-700 text-xs font-bold rounded hover:bg-rose-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                        <span>📄</span> New Diagram
                    </button>
                    <div class="grid grid-cols-2 gap-2">
                        <button (click)="saveToFile()" class="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 transition-colors shadow-sm">
                            Save JSON
                        </button>
                        <button (click)="triggerFileInput()" class="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 transition-colors shadow-sm">
                            Load JSON
                        </button>
                    </div>

                    <input #fileInput type="file" (change)="onFileSelected($event)" class="hidden" accept=".json">

                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <button (click)="exportFullSvg()" class="px-3 py-2 bg-slate-800 text-white text-[10px] font-bold rounded hover:bg-slate-900 transition-colors shadow-sm">
                            Export SVG
                        </button>
                        <button (click)="exportFullPng()" class="px-3 py-2 bg-slate-800 text-white text-[10px] font-bold rounded hover:bg-slate-900 transition-colors shadow-sm">
                            Export PNG
                        </button>
                    </div>
                </div>

                @if (!selectedNode() && !selectedLink()) {
                <div class="text-sm text-slate-400 italic text-center py-8">
                    <div class="mb-2 text-3xl opacity-50">✋</div>
                    Select an element to edit properties.
                </div>
                }
                <!-- Node Properties -->
                 @if (selectedNode(); as node) {
                <div class="space-y-4 animate-fadeIn">
                    <div>
                        <label class="block text-xs font-medium text-slate-700 mb-1">Label</label>
                        <textarea [(ngModel)]="node.label" (input)="updateData()" (focus)="recordSnapshot()" (change)="commitSnapshot()"
                               class="w-full h-20 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                               placeholder="State name"></textarea>
                    </div>

                    <div>
                        <div class="flex justify-between mb-1">
                            <label class="block text-xs font-medium text-slate-700">Size</label>
                            <span class="text-xs font-mono text-slate-500">{{node.size}}px</span>
                        </div>
                        <input type="range" min="60" max="250" [(ngModel)]="node.size" (input)="updateData()" (focus)="recordSnapshot()" (change)="commitSnapshot()"
                               class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600">
                    </div>

                    <div class="space-y-3 pt-2">
                        <label class="flex items-center gap-3 p-3 rounded bg-slate-50 border border-slate-100 hover:bg-slate-100 cursor-pointer">
                            <input type="checkbox" [(ngModel)]="node.isStart" (change)="updateData(); commitSnapshot()" (mousedown)="recordSnapshot()"
                                   class="w-5 h-5 text-green-600 rounded border-slate-300 focus:ring-green-500">
                            <span class="text-sm font-medium text-slate-700">Initial State</span>
                        </label>

                        <label class="flex items-center gap-3 p-3 rounded bg-slate-50 border border-slate-100 hover:bg-slate-100 cursor-pointer">
                            <input type="checkbox" [(ngModel)]="node.isEnd" (change)="updateData(); commitSnapshot()" (mousedown)="recordSnapshot()"
                                   class="w-5 h-5 text-red-600 rounded border-slate-300 focus:ring-red-500">
                            <span class="text-sm font-medium text-slate-700">Final State</span>
                        </label>
                    </div>
                </div>
                 }

                <!-- Link Properties -->
                @if (selectedLink(); as link) {
                    <div class="space-y-6 animate-fadeIn">
                        <div>
                            <label class="block text-xs font-medium text-slate-700 mb-1">Label</label>
                            <input type="text" [(ngModel)]="link.label" (input)="updateData()" (focus)="recordSnapshot()" (change)="commitSnapshot()"
                                class="w-full px-3 py-4 md:py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Event name">
                        </div>


                        <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <!-- Helper for Straight Lines -->
                             @if (!isSelfLoop(link)) {
                        <label class="flex items-center gap-3 p-3 rounded bg-slate-50 border border-slate-100 hover:bg-slate-100 cursor-pointer">
                            <input type="checkbox"
                              [checked]="isLinkStraight(link)"
                              (change)="recordSnapshot(); toggleLinkStraight(link, $event); commitSnapshot()"
                              class="w-5 h-5 text-red-600 rounded border-slate-300 focus:ring-red-500">
                            <span class="text-sm font-medium text-slate-700">Straight Line</span>
                        </label>
                             }

                            </div>
                    </div>
                }

            </div>

            <!-- JSON Data (Hidden on small mobile) -->
            <div class="border-t border-slate-200 bg-slate-50 p-4 shrink-0 hidden 2xl:block">
                <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Raw Data (JSON)</h3>
                <textarea [ngModel]="jsonString()" (ngModelChange)="onJsonManualChange($event)"
                          class="w-full h-24 p-2 text-[9px] font-mono border border-slate-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 mb-1 bg-white"
                          placeholder="JSON data..."></textarea>
            </div>

            <!-- Mobile Zoom Control (Sidebar Only) -->
            <div class="md:hidden p-5">
              <div class="md:hidden flex items-center justify-between m-2 bg-slate-100 rounded-lg p-1 border border-slate-200 mb-2">
                  <button (click)="zoomOut()" class="w-10 h-8 flex items-center justify-center rounded bg-white shadow-sm text-slate-700 font-bold hover:bg-slate-50">-</button>
                  <button (click)="resetZoom()" class="text-xs font-mono font-bold text-slate-600 px-2">{{ zoomPercent() }}%</button>
                  <button (click)="zoomIn()" class="w-10 h-8 flex items-center justify-center rounded bg-white shadow-sm text-slate-700 font-bold hover:bg-slate-50">+</button>
              </div>
            </div>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    @reference 'tailwindcss';

    .btn-tool { @apply h-9 px-4 rounded-md text-xs font-bold transition-all border active:scale-95 flex items-center justify-center min-w-max; }
    .btn-outline-indigo { @apply border-indigo-600 bg-indigo-50 text-indigo-700 hover:bg-indigo-100; }
    .btn-outline-amber { @apply border-amber-600 bg-amber-50 text-amber-700 hover:bg-amber-100; }
    .btn-outline-rose { @apply border-rose-600 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-30 disabled:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 disabled:active:scale-100 disabled:cursor-not-allowed; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #4f46e5; margin-top: -4px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer; }
    input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 8px; cursor: pointer; background: #e2e8f0; border-radius: 4px; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fadeIn { animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class App {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('svgElement', { static: true }) svgElement!: ElementRef<SVGSVGElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // --- Signals ---
  nodes = signal<FsmNode[]>([]);
  links = signal<FsmLink[]>([]);
  interactionMode = signal<'select' | 'connect'>('select');
  selectedNode = signal<FsmNode | null>(null);
  selectedLink = signal<FsmLink | null>(null);
  viewOffset = signal<Point>({ x: 0, y: 0 });
  zoomLevel = signal<number>(1.0);
  isSidebarOpen = signal<boolean>(false);

  zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));
  jsonString = computed(() => JSON.stringify({ nodes: this.nodes(), links: this.links() }, null, 2));

    // --- Pinch to Zoom State ---
  initialPinchDistance = 0;
  initialZoomLevel = 1;

  // --- History ---
  historyPast: GraphData[] = [];
  historyFuture: GraphData[] = [];
  tempSnapshot: GraphData | null = null; // Used for drag/edit operations

  // --- Control Key Mode Toggle ---
  previousMode: 'select' | 'connect' | null = null;

  // --- Interaction States ---
  isDraggingNode = false;
  isDraggingLineBody = false;
  isPanning = false;
  isLargeScreen = signal<boolean>(window.innerWidth >= 1024);

  nodeGrabOffset: Point = { x: 0, y: 0 };
  panLastPos: Point = { x: 0, y: 0 };
  linkGrabOffset: Point = { x: 0, y: 0 };

  tempLink = signal<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  connectSourceId: string | null = null;
  cachedCanvasRect: DOMRect | null = null;

  constructor() {
    // Try to load from Local Storage
    const savedData = localStorage.getItem('fsm_db');
    let loaded = false;

    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
                this.nodes.set(data.nodes);
                this.links.set(data.links);
                loaded = true;
            }
        } catch (e) {
            console.warn('Could not parse local storage data', e);
        }
    }

    // If nothing loaded, create default graph
    if (!loaded) {
        this.addNodeAt(200, 300, 'Initial\nState', true, false);
        this.addNodeAt(550, 300, 'Final\nState', false, true);
    }

    // Setup Effect to auto-save whenever signals change
    effect(() => {
        const json = this.jsonString(); // Reactive dependency
        localStorage.setItem('fsm_db', json);
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.isLargeScreen.set(window.innerWidth >= 1024);
  }

  trackById(index: number, item: any) {
    return item.id;
  }

  updateData() {
    this.nodes.set([...this.nodes()]);
    this.links.set([...this.links()]);
  }


  newDiagram() {
    this.pushState(this.getCurrentState()); // Save undo point

    // Reset data
    this.nodes.set([]);
    this.links.set([]);
    this.selectedNode.set(null);
    this.selectedLink.set(null);
    this.isSidebarOpen.set(false);

    // Add default template
    this.addNodeAt(200, 300, 'Initial\nState', true, false);
    this.addNodeAt(550, 300, 'Final\nState', false, true);

    this.resetView();
  }

  onJsonManualChange(val: string) {
    this.recordSnapshot();
    try {
        const data: GraphData = JSON.parse(val);
        if (data.nodes && data.links) {
            this.nodes.set(data.nodes);
            this.links.set(data.links);
            this.commitSnapshot();
        }
    } catch(e) {}
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;

    // --- Ctrl Key Mode Toggle (Press) ---
    if (event.key === 'Control' && !this.previousMode) {
         if (this.interactionMode() !== 'connect') {
             this.previousMode = this.interactionMode();
             this.setMode('connect');
         }
    }

    // Handle Undo/Redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z)
    if ((event.ctrlKey || event.metaKey) && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        if (event.key === 'z') {
            event.preventDefault();
            this.undo();
            return;
        }
        if (event.key === 'y' || (event.shiftKey && event.key === 'Z')) {
            event.preventDefault();
            this.redo();
            return;
        }
    }

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (event.key === 'Delete' || event.key === 'Backspace') this.deleteSelected();
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
     // --- Ctrl Key Mode Toggle (Release) ---
     if (event.key === 'Control' && this.previousMode) {
         this.setMode(this.previousMode);
         this.previousMode = null;
     }
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    if (event.deltaY < 0) this.zoomIn(); else this.zoomOut();
  }

  zoomIn() { this.zoomLevel.update(z => Math.min(5, z * 1.05)); }
  zoomOut() { this.zoomLevel.update(z => Math.max(0.05, z / 1.05)); }
  resetZoom() { this.zoomLevel.set(1.0); }
  resetView() { this.viewOffset.set({ x: 0, y: 0 }); this.zoomLevel.set(1.0); }

  saveToFile() {
    const blob = new Blob([this.jsonString()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fsm_diagram.json'; a.click();
    URL.revokeObjectURL(url);
  }

  triggerFileInput() { this.fileInput.nativeElement.click(); }
  onFileSelected(event: any) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
        try {
            const data: GraphData = JSON.parse(e.target.result);
            if (data.nodes && data.links) {
                this.nodes.set(data.nodes); this.links.set(data.links);
                this.selectedNode.set(null); this.selectedLink.set(null); this.resetView();
            }
        } catch(err) { alert('Error loading file.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // --- History Management ---

  getCurrentState(): GraphData {
      return JSON.parse(JSON.stringify({ nodes: this.nodes(), links: this.links() }));
  }

  pushState(state: GraphData) {
      this.historyPast.push(state);
      this.historyFuture = []; // Clear redo stack on new action
      if (this.historyPast.length > 50) this.historyPast.shift(); // Limit history
  }

  undo() {
      if (this.historyPast.length === 0) return;
      const current = this.getCurrentState();
      this.historyFuture.push(current);
      const previous = this.historyPast.pop()!;
      this.nodes.set(previous.nodes);
      this.links.set(previous.links);
  }

  redo() {
      if (this.historyFuture.length === 0) return;
      const current = this.getCurrentState();
      this.historyPast.push(current);
      const next = this.historyFuture.pop()!;
      this.nodes.set(next.nodes);
      this.links.set(next.links);
  }

  // Called before start of a discrete action or drag
  recordSnapshot() {
      this.tempSnapshot = this.getCurrentState();
  }

  // Called after end of action. Checks if changed, then saves.
  commitSnapshot() {
      if (!this.tempSnapshot) return;
      const current = this.getCurrentState();
      if (JSON.stringify(this.tempSnapshot) !== JSON.stringify(current)) {
          this.pushState(this.tempSnapshot);
      }
      this.tempSnapshot = null;
  }


  // --- Interaction Logic ---

  onTouchStart(event: TouchEvent) {
        if (event.touches.length === 2) {
        // Pinch to zoom start
        event.preventDefault(); // Stop default browser zoom

        this.initialPinchDistance = Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY
        );

        this.initialZoomLevel = this.zoomLevel();

        return;
    }
    if (event.touches.length > 1) return;
    const touch = event.touches[0];
    this.handleInteractionDown(touch.clientX, touch.clientY);
  }

  onTouchMove(event: TouchEvent) {
        if (event.touches.length === 2) {
        // Pinch logic
        event.preventDefault();
        const dist = Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY
        );
        if (this.initialPinchDistance > 0) {
            const scale = dist / this.initialPinchDistance;
            // Limit zoom scale
            const newZoom = Math.min(5, Math.max(0.05, this.initialZoomLevel * scale));
            this.zoomLevel.set(newZoom);
        }
        return;
    }

    if (event.touches.length > 1) return;
    const touch = event.touches[0];
    if (this.isDraggingNode || this.isDraggingLineBody || this.isPanning || this.connectSourceId) {
        event.preventDefault(); // Stop mobile scrolling while interacting
    }
    this.handleInteractionMove(touch.clientX, touch.clientY);
  }


  onTouchEnd(event: TouchEvent) {
      this.initialPinchDistance = 0; // Reset pinch
      this.onGlobalInteractionUp(event);
  }

  onCanvasMouseDown(event: MouseEvent) {
    this.handleInteractionDown(event.clientX, event.clientY);
  }

  onCanvasMouseMove(event: MouseEvent) {
    this.handleInteractionMove(event.clientX, event.clientY);
  }


  private handleInteractionDown(clientX: number, clientY: number) {
    this.cachedCanvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();
    const wp = this.getWorldPointFromClient(clientX, clientY);

    // If user clicked empty space
    this.selectedNode.set(null);
    this.selectedLink.set(null);
    this.isSidebarOpen.set(false);
    this.isPanning = true;
    this.panLastPos = { x: clientX, y: clientY };
  }

  private handleInteractionMove(clientX: number, clientY: number) {
    if (this.isPanning) {
        const dx = clientX - this.panLastPos.x;
        const dy = clientY - this.panLastPos.y;
        this.viewOffset.update(v => ({ x: v.x + dx, y: v.y + dy }));
        this.panLastPos = { x: clientX, y: clientY };
        return;
    }

    const wp = this.getWorldPointFromClient(clientX, clientY);

    if (this.isDraggingNode && this.selectedNode()) {
        const node = this.selectedNode()!;

        // Calculate new position
        const newX = wp.x - this.nodeGrabOffset.x;
        const newY = wp.y - this.nodeGrabOffset.y;

        // Calculate delta
        const dx = newX - node.x;
        const dy = newY - node.y;

        // Apply new position
        node.x = newX;
        node.y = newY;

        // Update connected links
        this.links().forEach(link => {
            if (link.sourceId === node.id && link.targetId === node.id) {
                 // Self-loop: Move control point exactly with node to maintain shape
                 link.controlPoint.x += dx;
                 link.controlPoint.y += dy;
            } else if (link.sourceId === node.id || link.targetId === node.id) {
                 // Normal link: Move control point by 50% to maintain nice curvature
                 link.controlPoint.x += dx * 0.5;
                 link.controlPoint.y += dy * 0.5;
            }
        });

        this.updateData();
    }

    if (this.isDraggingLineBody && this.selectedLink()) {
        const link = this.selectedLink()!;
        if (this.isSelfLoop(link)) {
            link.controlPoint.x = wp.x + this.linkGrabOffset.x;
            link.controlPoint.y = wp.y + this.linkGrabOffset.y;
        } else {
            const s = this.nodes().find(n => n.id === link.sourceId), t = this.nodes().find(n => n.id === link.targetId);
            if (s && t) {
                link.controlPoint.x = 2 * (wp.x + this.linkGrabOffset.x) - (s.x + t.x) / 2;
                link.controlPoint.y = 2 * (wp.y + this.linkGrabOffset.y) - (s.y + t.y) / 2;
            }
        }
        this.updateData();
    }

    if (this.connectSourceId) {
        this.tempLink.set({ ...this.tempLink()!, x2: wp.x, y2: wp.y });
    }
  }

  @HostListener('window:mouseup', ['$event'])
  @HostListener('window:touchend', ['$event'])
  onGlobalInteractionUp(event: any) {
    if (this.interactionMode() === 'connect' && this.connectSourceId) {
        const wp = this.tempLink() ? { x: this.tempLink()!.x2, y: this.tempLink()!.y2 } : { x: 0, y: 0 };
        const targetNode = this.nodes().find(n => Math.sqrt(Math.pow(n.x - wp.x, 2) + Math.pow(n.y - wp.y, 2)) < (n.size / 2 + 10));
        if (targetNode) this.createLink(this.connectSourceId, targetNode.id);
    }

    // Commit History if something was dragged or connected
    if (this.isDraggingNode || this.isDraggingLineBody || this.connectSourceId) {
        this.commitSnapshot();
    }

    this.isDraggingNode = false;
    this.isDraggingLineBody = false;
    this.isPanning = false;
    this.connectSourceId = null;
    this.tempLink.set(null);
    this.updateData();
  }

  getWorldPointFromClient(clientX: number, clientY: number): Point {
    const rect = this.cachedCanvasRect || this.canvasContainer.nativeElement.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) - this.viewOffset().x) / this.zoomLevel(),
      y: ((clientY - rect.top) - this.viewOffset().y) / this.zoomLevel()
    };
  }

  setMode(mode: 'select' | 'connect') { this.interactionMode.set(mode); this.selectedNode.set(null); this.selectedLink.set(null); }

  addNode() {
    const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
    const x = (rect.width / 2 - this.viewOffset().x) / this.zoomLevel();
    const y = (rect.height / 2 - this.viewOffset().y) / this.zoomLevel();
    this.addNodeAt(x, y, 'New\nState');
  }

  addNodeAt(x: number, y: number, label: string, isStart = false, isEnd = false) {
    const id = crypto.randomUUID();
    this.nodes.update(nodes => [...nodes, { id, x, y, size: 100, label, isStart, isEnd }]);
  }

  deleteSelected() {
    const node = this.selectedNode(), link = this.selectedLink();
    if (node) {
      this.links.set(this.links().filter(l => l.sourceId !== node.id && l.targetId !== node.id));
      this.nodes.set(this.nodes().filter(n => n.id !== node.id));
      this.selectedNode.set(null);
    } else if (link) {
      this.links.set(this.links().filter(l => l.id !== link.id));
      this.selectedLink.set(null);
    }

    this.isSidebarOpen.set(false);
  }

  onNodeMouseDown(node: FsmNode, event: any) {
    event.preventDefault(); event.stopPropagation();
    this.recordSnapshot();
    this.isSidebarOpen.set(false);

    this.cachedCanvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();

    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const wp = this.getWorldPointFromClient(clientX, clientY);

    if (this.interactionMode() === 'connect') {
      this.connectSourceId = node.id;
      this.tempLink.set({ x1: node.x, y1: node.y, x2: wp.x, y2: wp.y });
    } else {
      this.selectedNode.set(node);
      this.selectedLink.set(null);
      this.isDraggingNode = true;
      this.nodeGrabOffset = { x: wp.x - node.x, y: wp.y - node.y };
    }
  }

  startDragLine(link: FsmLink, event: any) {
    event.preventDefault(); event.stopPropagation();

    this.recordSnapshot(); // Start drag history snapshot
    this.isSidebarOpen.set(false);

    this.cachedCanvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();

    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const wp = this.getWorldPointFromClient(clientX, clientY);

    this.selectedLink.set(link);
    this.selectedNode.set(null);
    this.isDraggingLineBody = true;

    if (this.isSelfLoop(link)) {
        this.linkGrabOffset = { x: link.controlPoint.x - wp.x, y: link.controlPoint.y - wp.y };
    } else {
        const s = this.nodes().find(n => n.id === link.sourceId), t = this.nodes().find(n => n.id === link.targetId);
        if(!s || !t) return;
        const midX = 0.25 * s.x + 0.5 * link.controlPoint.x + 0.25 * t.x;
        const midY = 0.25 * s.y + 0.5 * link.controlPoint.y + 0.25 * t.y;
        this.linkGrabOffset = { x: midX - wp.x, y: midY - wp.y };
    }
  }

  // Double click handlers for direct edit access
  onNodeDoubleClick(node: FsmNode, event: any) {
    event.preventDefault(); event.stopPropagation();
    this.selectedNode.set(node);
    this.isSidebarOpen.set(true);
  }

  onLinkDoubleClick(link: FsmLink, event: any) {
    event.preventDefault(); event.stopPropagation();
    this.selectedLink.set(link);
    this.isSidebarOpen.set(true);
  }

  // --- Geometry ---

  isSelfLoop(link: FsmLink) { return link.sourceId === link.targetId; }
  getSliderMin() { return this.selectedLink() && this.isSelfLoop(this.selectedLink()!) ? 15 : 10; }
  getSliderMax() { return this.selectedLink() && this.isSelfLoop(this.selectedLink()!) ? 160 : 400; }
  getSliderValue() {
    const link = this.selectedLink(); if (!link) return 50;
    if (this.isSelfLoop(link)) return Math.round((link.spread || Math.PI/6) * (180/Math.PI));
    const s = this.nodes().find(n => n.id === link.sourceId), t = this.nodes().find(n => n.id === link.targetId);
    if(!s || !t) return 50;
    return Math.round(Math.sqrt(Math.pow(link.controlPoint.x - (s.x + t.x)/2, 2) + Math.pow(link.controlPoint.y - (s.y + t.y)/2, 2)));
  }

  isLinkStraight(link: FsmLink): boolean {
    return this.getSliderValue() < 5; // Tolerance
  }

  toggleLinkStraight(link: FsmLink, event: any) {
    if (event.target.checked) {
        const s = this.nodes().find(n => n.id === link.sourceId);
        const t = this.nodes().find(n => n.id === link.targetId);
        if (s && t) {
            link.controlPoint.x = (s.x + t.x) / 2;
            link.controlPoint.y = (s.y + t.y) / 2;
            this.updateData();
        }
    }
  }

  onSliderChange(event: any) {
    const link = this.selectedLink(), val = Number(event.target.value); if (!link) return;
    if (this.isSelfLoop(link)) link.spread = val * (Math.PI/180);
    else {
        const s = this.nodes().find(n => n.id === link.sourceId), t = this.nodes().find(n => n.id === link.targetId);
        if (s && t) {
            const mx = (s.x + t.x)/2, my = (s.y + t.y)/2;
            let dx = link.controlPoint.x - mx, dy = link.controlPoint.y - my;
            let d = Math.sqrt(dx*dx + dy*dy); if (d === 0) { dx = 0; dy = 1; d = 1; }
            link.controlPoint.x = mx + (dx / d) * val; link.controlPoint.y = my + (dy / d) * val;
        }
    }
    this.updateData();
  }

  createLink(sId: string, tId: string) {
    const s = this.nodes().find(n => n.id === sId);
    const t = this.nodes().find(n => n.id === tId);
    if (!s || !t) return;

    let controlPoint: Point;
    let spread: number | undefined;

    if (sId === tId) {
        // Self-loop: Standard curve upwards
        controlPoint = { x: s.x, y: s.y - s.size * 1.5 };
        spread = Math.PI / 4;
    } else {
        // Connection between two nodes: Straight line default (Midpoint)
        controlPoint = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
        spread = undefined;
    }

    this.links.update(ls => [...ls, {
        id: crypto.randomUUID(),
        sourceId: sId,
        targetId: tId,
        label: 'Event',
        controlPoint: controlPoint,
        spread: spread
    }]);
  }

  getLinkPath(link: FsmLink): string {
    const s = this.nodes().find(n => n.id === link.sourceId), t = this.nodes().find(n => n.id === link.targetId);
    if (!s || !t) return '';
    const rS = s.size / 2, rT = t.size / 2;
    if (s.id === t.id) {
        const dx = link.controlPoint.x - s.x, dy = link.controlPoint.y - s.y, rot = Math.atan2(dy, dx), spr = link.spread || Math.PI/4;
        const x1 = s.x + Math.cos(rot - spr) * rS, y1 = s.y + Math.sin(rot - spr) * rS;
        const x2 = s.x + Math.cos(rot + spr) * rT, y2 = s.y + Math.sin(rot + spr) * rT;
        const len = Math.max(20, (Math.sqrt(dx*dx + dy*dy) - rS) * 1.3);
        return `M ${x1} ${y1} C ${x1 + Math.cos(rot-spr)*len} ${y1 + Math.sin(rot-spr)*len} ${x2 + Math.cos(rot+spr)*len} ${y2 + Math.sin(rot+spr)*len} ${x2} ${y2}`;
    }
    const a1 = Math.atan2(link.controlPoint.y - s.y, link.controlPoint.x - s.x);
    const a2 = Math.atan2(link.controlPoint.y - t.y, link.controlPoint.x - t.x);
    return `M ${s.x + Math.cos(a1)*rS} ${s.y + Math.sin(a1)*rS} Q ${link.controlPoint.x} ${link.controlPoint.y} ${t.x + Math.cos(a2)*rT} ${t.y + Math.sin(a2)*rT}`;
  }

  getLabelPos(link: FsmLink): Point | null {
      const s = this.nodes().find(n => n.id === link.sourceId), t = this.nodes().find(n => n.id === link.targetId);
      if (!s || !t) return null;
      if (s.id === t.id) {
          const dx = link.controlPoint.x - s.x, dy = link.controlPoint.y - s.y, rot = Math.atan2(dy, dx), spr = link.spread || Math.PI/4;
          const x1 = s.x + Math.cos(rot - spr) * (s.size/2), y1 = s.y + Math.sin(rot - spr) * (s.size/2);
          const x2 = s.x + Math.cos(rot + spr) * (s.size/2), y2 = s.y + Math.sin(rot + spr) * (s.size/2);
          const len = Math.max(20, (Math.sqrt(dx*dx + dy*dy) - (s.size/2)) * 1.3);
          const cp1x = x1 + Math.cos(rot-spr)*len, cp1y = y1 + Math.sin(rot-spr)*len, cp2x = x2 + Math.cos(rot+spr)*len, cp2y = y2 + Math.sin(rot+spr)*len;
          return { x: 0.125*x1 + 0.375*cp1x + 0.375*cp2x + 0.125*x2, y: 0.125*y1 + 0.375*cp1y + 0.375*cp2y + 0.125*y2 };
      }
      const rS = s.size / 2, rT = t.size / 2;
      const a1 = Math.atan2(link.controlPoint.y - s.y, link.controlPoint.x - s.x);
      const a2 = Math.atan2(link.controlPoint.y - t.y, link.controlPoint.x - t.x);
      const p0x = s.x + Math.cos(a1)*rS, p0y = s.y + Math.sin(a1)*rS;
      const p2x = t.x + Math.cos(a2)*rT, p2y = t.y + Math.sin(a2)*rT;
      return {
          x: 0.25*p0x + 0.5*link.controlPoint.x + 0.25*p2x,
          y: 0.25*p0y + 0.5*link.controlPoint.y + 0.25*p2y
      };
  }

  // --- Export Logic ---

  private getFullGraphBBox() {
    if (this.nodes().length === 0) return { minX: 0, minY: 0, width: 800, height: 600 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.nodes().forEach(n => {
        minX = Math.min(minX, n.x - n.size); minY = Math.min(minY, n.y - n.size);
        maxX = Math.max(maxX, n.x + n.size); maxY = Math.max(maxY, n.y + n.size);
    });
    this.links().forEach(l => {
        minX = Math.min(minX, l.controlPoint.x - 50); minY = Math.min(minY, l.controlPoint.y - 50);
        maxX = Math.max(maxX, l.controlPoint.x + 50); maxY = Math.max(maxY, l.controlPoint.y + 50);
    });
    return { minX: minX - 100, minY: minY - 100, width: (maxX - minX) + 200, height: (maxY - minY) + 200 };
  }

  private createFullExportSvg(): SVGSVGElement {
    const bbox = this.getFullGraphBBox();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", bbox.width.toString());
    svg.setAttribute("height", bbox.height.toString());
    svg.setAttribute("viewBox", `0 0 ${bbox.width} ${bbox.height}`);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "white");
    svg.appendChild(bg);
    const defs = this.svgElement.nativeElement.querySelector('defs')?.cloneNode(true);
    if (defs) svg.appendChild(defs);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${-bbox.minX}, ${-bbox.minY})`);
    svg.appendChild(g);
    this.links().forEach(link => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", this.getLinkPath(link));
        path.setAttribute("fill", "none"); path.setAttribute("stroke", "#64748b");
        path.setAttribute("stroke-width", "2"); path.setAttribute("marker-end", "url(#arrowhead)");
        g.appendChild(path);
        const labelPos = this.getLabelPos(link);
        if (labelPos) {
            const labelWidth = (link.label.length * 8) + 16;
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", (labelPos.x - labelWidth / 2).toString()); rect.setAttribute("y", (labelPos.y - 12).toString());
            rect.setAttribute("width", labelWidth.toString()); rect.setAttribute("height", "24");
            rect.setAttribute("rx", "6"); rect.setAttribute("fill", "white");
            rect.setAttribute("stroke", '#cbd5e1'); rect.setAttribute("stroke-width", "1");
            g.appendChild(rect);
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", labelPos.x.toString()); text.setAttribute("y", labelPos.y.toString());
            text.setAttribute("text-anchor", "middle"); text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("font-family", "monospace"); text.setAttribute("font-size", "12");
            text.setAttribute("font-weight", "bold"); text.setAttribute("fill", "#334155");
            text.textContent = link.label; g.appendChild(text);
        }
    });
    this.nodes().forEach(node => {
        const r = node.size / 2;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", node.x.toString()); circle.setAttribute("cy", node.y.toString());
        circle.setAttribute("r", r.toString());
        circle.setAttribute("fill", node.isStart ? '#f0fdf4' : (node.isEnd ? '#fef2f2' : 'white'));
        circle.setAttribute("stroke", node.isStart ? '#166534' : (node.isEnd ? '#991b1b' : '#475569'));
        circle.setAttribute("stroke-width", node.isEnd ? "4" : "2");
        g.appendChild(circle);
        const lines = node.label.split('\n');
        lines.forEach((line, i) => {
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", node.x.toString());
            text.setAttribute("y", (node.y + (i - (lines.length-1)/2) * 14).toString());
            text.setAttribute("text-anchor", "middle"); text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("font-family", "sans-serif"); text.setAttribute("font-size", "12");
            text.setAttribute("font-weight", "bold"); text.setAttribute("fill", "#334155");
            text.textContent = line; g.appendChild(text);
        });
    });
    return svg;
  }

  exportFullSvg() {
    const svg = this.createFullExportSvg();
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fsm_export.svg'; a.click();
    URL.revokeObjectURL(url);
  }

  async exportFullPng() {
    const svg = this.createFullExportSvg();
    const bbox = this.getFullGraphBBox();
    const source = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = bbox.width * 2; canvas.height = bbox.height * 2;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(2, 2); ctx.fillStyle = "white"; ctx.fillRect(0, 0, bbox.width, bbox.height);
    const img = new Image();
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const dl = document.createElement('a'); dl.href = pngUrl; dl.download = 'fsm_export.png'; dl.click();
        URL.revokeObjectURL(url);
    };
    img.src = url;
  }
}
