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

      <div class="hidden md:block pointer-events-none fixed inset-0 z-[50]">
        <div class="absolute bottom-8 right-8 pointer-events-auto">
          <div class="bg-white/90 backdrop-blur-xl border border-white/40 px-2 py-1.5 rounded-full shadow-sm flex items-center gap-1 transition-transform hover:shadow-md">

            <button (click)="zoomOut()" class="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>

            <button (click)="resetView()" class="text-xs font-bold text-slate-500 w-12 text-center hover:text-indigo-600 transition-colors select-none tabular-nums" title="Reset to 100%">
                {{ zoomPercent() }}%
            </button>

            <button (click)="zoomIn()" class="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        </div>
        <div class="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
          <div class="bg-white/90 backdrop-blur-xl border border-white/40 px-8 py-3 rounded-full shadow-sm flex items-center gap-8 group relative hover:shadow-md transition-all">

            <div class="cursor-pointer py-1">
                <span class="text-sm font-bold tracking-widest text-slate-700 flex items-center gap-2">
                fsm-designer<span class="text-[10px] opacity-40">▼</span>
                </span>

                <div class="absolute top-full left-0 mt-3 w-64 bg-white/95 backdrop-blur-2xl border border-slate-200 rounded-2xl shadow-2xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top translate-y-2 group-hover:translate-y-0">
                    <button (click)="newDiagram()" class="w-full text-left px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors tracking-wide">NEW DIAGRAM</button>
                    <div class="h-px bg-slate-100 my-2"></div>
                    <button (click)="saveToFile()" class="w-full text-left px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors tracking-wide">SAVE JSON</button>
                    <button (click)="triggerFileInput()" class="w-full text-left px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors tracking-wide">LOAD JSON</button>
                    <button (click)="exportFullSvg()" class="w-full text-left px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors tracking-wide">EXPORT SVG</button>
                    <button (click)="exportFullPng()" class="w-full text-left px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors tracking-wide">EXPORT PNG</button>
                </div>
            </div>

            <div class="w-px h-5 bg-slate-300"></div>

            <div class="flex gap-4">
               <button (click)="undo()" [disabled]="!historyPast.length" class="text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-colors transform active:scale-90" title="Undo">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h10a8 8 0 0 1 8 8v2c0-1.1-.9-2-2-2H7l4-4"/><path d="m7 14-4-4 4-4"/></svg>
               </button>
               <button (click)="redo()" [disabled]="!historyFuture.length" class="text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-colors transform active:scale-90" title="Redo">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10H11a8 8 0 0 0-8 8v2c0-1.1.9-2 2-2h14l-4-4"/><path d="m17 14 4-4-4-4"/></svg>
               </button>
            </div>
          </div>
        </div>

        <div class="absolute top-1/2 left-8 -translate-y-1/2 flex flex-col gap-4 pointer-events-auto">
          <div class="bg-white/80 backdrop-blur-md border border-white/40 p-3 rounded-2xl shadow-sm flex flex-col gap-3">

            <button (click)="addNode()" title="Add Node" class="w-12 h-12 flex items-center justify-center bg-white border border-indigo-100 text-indigo-600 rounded-xl shadow-md hover:shadow-lg hover:border-indigo-200 hover:scale-105 active:scale-95 transition-all mb-2 group">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:rotate-90 transition-transform"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>

            <button (click)="setMode('select')" title="Move Mode" [class.bg-indigo-50]="interactionMode() === 'select'" [class.text-indigo-600]="interactionMode() === 'select'" class="w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
              <span class="text-2xl">✋</span>
            </button>
            <button (click)="setMode('connect')" title="Connect Mode" [class.bg-indigo-50]="interactionMode() === 'connect'" [class.text-indigo-600]="interactionMode() === 'connect'" class="w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
              <span class="text-2xl">🔗</span>
            </button>
          </div>
        </div>

        @if (selectedNode() || selectedLink()) {
          <div class="absolute top-28 right-10 w-96 pointer-events-auto animate-fadeInRight">
             <div class="bg-white/95 backdrop-blur-xl border border-white/50 rounded-[2rem] shadow-2xl p-8">

                <div class="flex justify-between items-center mb-8">
                   <h2 class="text-sm font-bold uppercase tracking-widest text-indigo-500">Properties</h2>
                   <button (click)="selectedNode.set(null); selectedLink.set(null)" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors text-lg">✕</button>
                </div>

                @if (selectedNode(); as node) {
                  <div class="space-y-8">
                    <div class="space-y-2">
                      <label class="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Label Name</label>
                      <textarea [(ngModel)]="node.label" (input)="updateData()" (focus)="recordSnapshot()" (change)="commitSnapshot()"
                                class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none h-28 transition-all shadow-inner"></textarea>
                    </div>

                    <div class="space-y-2">
                        <label class="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Size: {{node.size}}px</label>
                        <input type="range" min="60" max="200" [(ngModel)]="node.size" (input)="updateData()" (mousedown)="recordSnapshot()" (mouseup)="commitSnapshot()"
                               class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                    </div>

                    <div class="space-y-4 pt-6 border-t border-slate-100 mt-4">
                       <label class="flex items-center gap-4 p-3 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 cursor-pointer group transition-all">
                           <input type="checkbox" [(ngModel)]="node.isStart" (change)="updateData(); commitSnapshot()" (mousedown)="recordSnapshot()"
                                  class="w-5 h-5 text-green-600 rounded border-slate-300 focus:ring-green-500 cursor-pointer">
                           <span class="text-sm font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">Initial State</span>
                       </label>

                       <label class="flex items-center gap-4 p-3 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 cursor-pointer group transition-all">
                           <input type="checkbox" [(ngModel)]="node.isEnd" (change)="updateData(); commitSnapshot()" (mousedown)="recordSnapshot()"
                                  class="w-5 h-5 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer">
                           <span class="text-sm font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">Final State</span>
                       </label>
                    </div>

                    <button (click)="deleteSelected()" class="w-full py-4 mt-4 text-rose-600 bg-white border border-rose-200 hover:border-rose-300 hover:bg-rose-50 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm active:scale-95">
                        Delete Node
                    </button>
                  </div>
                }

                @if (selectedLink(); as link) {
                   <div class="space-y-8">
                      <div class="space-y-2">
                        <label class="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Event Name</label>
                        <input type="text" [(ngModel)]="link.label" (input)="updateData()" (focus)="recordSnapshot()" (change)="commitSnapshot()"
                               class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-inner">
                      </div>

                      @if (isSelfLoop(link)) {
                        <div class="space-y-2">
                           <label class="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Loop Width</label>
                           <input type="range" min="10" max="90" [ngModel]="getLoopSpreadDegrees(link)" (ngModelChange)="setLoopSpreadDegrees(link, $event)"
                                  class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                        </div>
                      }

                      <button (click)="deleteSelected()" class="w-full py-4 mt-4 text-rose-600 bg-white border border-rose-200 hover:border-rose-300 hover:bg-rose-50 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm active:scale-95">
                        Delete Link
                      </button>
                   </div>
                }
             </div>
          </div>
        }
      </div>

    <div class="md:hidden pointer-events-none fixed inset-0 z-[50]">

         <div class="absolute top-4 left-4 right-4 flex justify-between pointer-events-auto">
             <button (click)="isSidebarOpen.set(true)" class="w-11 h-11 bg-white/90 backdrop-blur shadow-sm border border-slate-100 rounded-full flex items-center justify-center active:scale-95 text-xl text-slate-700">☰</button>
             <div class="flex gap-2">
                 <button (click)="undo()" [disabled]="!historyPast.length" class="w-11 h-11 bg-white/90 backdrop-blur shadow-sm border border-slate-100 rounded-full flex items-center justify-center disabled:opacity-50 active:scale-95 text-slate-600">↩️</button>
                 <button (click)="redo()" [disabled]="!historyFuture.length" class="w-11 h-11 bg-white/90 backdrop-blur shadow-sm border border-slate-100 rounded-full flex items-center justify-center disabled:opacity-50 active:scale-95 text-slate-600">↪️</button>
             </div>
         </div>

         <div class="absolute bottom-8 left-6 pointer-events-auto">
             <button (click)="resetView()" class="w-14 h-14 bg-white/90 backdrop-blur shadow-lg border border-slate-100 rounded-2xl flex flex-col items-center justify-center active:scale-90 transition-transform">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 mb-0.5"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="1"></circle></svg>
                 <span class="text-[10px] font-bold text-slate-600 font-mono leading-none">{{ zoomPercent() }}%</span>
             </button>
         </div>

         <div class="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div class="flex items-center bg-white/90 backdrop-blur shadow-lg border border-slate-100 rounded-full p-1.5">
                <button (click)="setMode('select')" [class.bg-slate-800]="interactionMode() === 'select'" [class.text-white]="interactionMode() === 'select'" class="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all text-slate-500">Move</button>
                <button (click)="setMode('connect')" [class.bg-slate-800]="interactionMode() === 'connect'" [class.text-white]="interactionMode() === 'connect'" class="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all text-slate-500">Link</button>
            </div>
         </div>

         <div class="absolute bottom-8 right-6 pointer-events-auto">
             <button (click)="addNode()" class="w-14 h-14 flex items-center justify-center bg-white border border-indigo-100 text-indigo-600 rounded-2xl shadow-xl shadow-indigo-500/10 active:scale-90 transition-all">
                 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
             </button>
         </div>

        <div class="fixed inset-0 z-[200] pointer-events-none" [class.pointer-events-auto]="isSidebarOpen()">
            <div class="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300"
                 [class.opacity-0]="!isSidebarOpen()" (click)="isSidebarOpen.set(false)"></div>

            <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] p-8 shadow-2xl transition-transform duration-500 transform max-h-[90vh] overflow-y-auto"
                 [class.translate-y-full]="!isSidebarOpen()">

                 <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8"></div>

                 <div class="space-y-4 pointer-events-auto">
                    <button (click)="newDiagram(); isSidebarOpen.set(false)"
                            class="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl text-sm font-bold uppercase tracking-widest active:bg-rose-100 transition-colors shadow-sm border border-rose-100">
                      New Diagram
                    </button>

                    <details class="group bg-slate-50 rounded-2xl overflow-hidden border border-slate-100">
                        <summary class="flex items-center justify-between p-4 cursor-pointer list-none">
                            <span class="text-xs font-bold uppercase text-slate-500 tracking-widest">Files & Export</span>
                            <span class="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div class="p-4 pt-0 grid grid-cols-2 gap-3 animate-fadeIn">
                            <button (click)="saveToFile()" class="py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 uppercase tracking-widest active:bg-slate-100">Save JSON</button>
                            <button (click)="triggerFileInput()" class="py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 uppercase tracking-widest active:bg-slate-100">Load JSON</button>
                            <button (click)="exportFullSvg()" class="py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 uppercase tracking-widest active:bg-slate-100">Export SVG</button>
                            <button (click)="exportFullPng()" class="py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 uppercase tracking-widest active:bg-slate-100">Export SVG</button>
                        </div>
                    </details>
                 </div>

                 @if (selectedNode() || selectedLink()) {
                    <div class="mt-8 pt-8 border-t border-slate-100 pointer-events-auto space-y-6">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xs font-bold uppercase text-indigo-500 tracking-widest">Properties</h3>
                            <button (click)="deleteSelected(); isSidebarOpen.set(false)" class="text-rose-500 text-[10px] font-black tracking-tighter uppercase">Delete Selected</button>
                        </div>

                        @if (selectedNode(); as node) {
                           <div class="space-y-4">
                              <textarea [(ngModel)]="node.label" (input)="updateData()" placeholder="Label name..."
                                      class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-base font-medium text-slate-700 outline-none h-24"></textarea>


                              <div class="flex gap-3">
                                 <button (click)="node.isStart = !node.isStart; updateData()"
                                         [class]="node.isStart ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-400 border-slate-200'"
                                         class="flex-grow py-3 border rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">
                                    Initial
                                 </button>
                                 <button (click)="node.isEnd = !node.isEnd; updateData()"
                                         [class]="node.isEnd ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-400 border-slate-200'"
                                         class="flex-grow py-3 border rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">
                                    Final
                                 </button>
                              </div>
                           </div>
                        }

                        @if (selectedLink(); as link) {
                           <div class="space-y-4">
                              <input type="text" [(ngModel)]="link.label" (input)="updateData()" placeholder="Event name..."
                                     class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-base font-medium text-slate-700 outline-none">

                              @if (isSelfLoop(link)) {
                                 <div class="p-4 bg-slate-50 rounded-2xl space-y-2">
                                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loop Width</label>
                                    <input type="range" min="10" max="90" [ngModel]="getLoopSpreadDegrees(link)" (ngModelChange)="setLoopSpreadDegrees(link, $event)"
                                           class="w-full h-2 bg-slate-200 rounded-lg appearance-none accent-indigo-600">
                                 </div>
                              }
                           </div>
                        }
                    </div>
                 }
            </div>
         </div>
      </div>

      <div class="flex-grow flex overflow-hidden relative">

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

            <div class="absolute inset-0 opacity-[0.03] pointer-events-none"
                 [style.background-position]="viewOffset().x + 'px ' + viewOffset().y + 'px'"
                 [style.background-size]="(20 * zoomLevel()) + 'px ' + (20 * zoomLevel()) + 'px'"
                 style="background-image: radial-gradient(#000 1px, transparent 1px);">
            </div>

            <svg #svgElement class="w-full h-full absolute top-0 left-0 pointer-events-none overflow-visible" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,2 L0,4 Z" fill="#64748b" /></marker>
                <marker id="arrowhead-selected" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,2 L0,4 Z" fill="#3b82f6" /></marker>
            </defs>

            <g [attr.transform]="'translate(' + viewOffset().x + ',' + viewOffset().y + ') scale(' + zoomLevel() + ')'">
                @for (link of links(); track link.id) {
                <g class="pointer-events-auto">
                    <path [attr.d]="getLinkPath(link)" fill="none" [attr.stroke]="selectedLink()?.id === link.id ? '#3b82f6' : '#64748b'" [attr.stroke-width]="selectedLink()?.id === link.id ? 3 : 2" [attr.marker-end]="selectedLink()?.id === link.id ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'" />
                    <g class="cursor-move" (mousedown)="startDragLine(link, $event)" (touchstart)="startDragLine(link, $event)" (dblclick)="onLinkDoubleClick(link, $event)">
                        <path [attr.d]="getLinkPath(link)" fill="none" stroke="transparent" stroke-linecap="round" pointer-events="stroke" [attr.stroke-width]="hitArea()" />
                        @if (getLabelPos(link); as pos) {
                        <g>
                            <rect [attr.x]="pos.x - (link.label.length * 4) - 8" [attr.y]="pos.y - 12" [attr.width]="(link.label.length * 8) + 16" height="24" rx="6" fill="white" [attr.stroke]="selectedLink()?.id === link.id ? '#3b82f6' : '#cbd5e1'" [attr.stroke-width]="selectedLink()?.id === link.id ? 2 : 1" class="shadow-sm" />
                            <text [attr.x]="pos.x" [attr.y]="pos.y" [attr.font-size]="12" text-anchor="middle" dominant-baseline="middle"
                                  class="font-medium fill-slate-700 select-none font-sans tracking-wide">
                            {{ link.label }}
                            </text>
                        </g>
                        }
                    </g>
                </g>
                }
                @if (tempLink()) { <line [attr.x1]="tempLink()!.x1" [attr.y1]="tempLink()!.y1" [attr.x2]="tempLink()!.x2" [attr.y2]="tempLink()!.y2" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5,5" class="pointer-events-none" /> }
            </g>
            </svg>

            @for (node of nodes(); track node.id) {
            <div class="absolute flex items-center justify-center rounded-full border-2 shadow-sm pointer-events-auto box-border transition-shadow"
                [style.width.px]="node.size" [style.height.px]="node.size"
                [style.transform]="'translate(' + (node.x * zoomLevel() + viewOffset().x) + 'px,' + (node.y * zoomLevel() + viewOffset().y) + 'px) translate(-50%, -50%) scale(' + zoomLevel() + ')'"
                [class.border-slate-600]="!node.isStart && !node.isEnd && selectedNode()?.id !== node.id"
                [class.border-green-600]="node.isStart" [class.bg-green-50]="node.isStart" [class.text-green-800]="node.isStart"
                [class.border-red-600]="node.isEnd" [class.bg-red-50]="node.isEnd" [class.text-red-800]="node.isEnd"
                [class.border-double]="node.isEnd" [class.border-4]="node.isEnd"
                [class.ring-2]="selectedNode()?.id === node.id" [class.ring-blue-500]="selectedNode()?.id === node.id" [class.ring-offset-2]="selectedNode()?.id === node.id"
                [class.bg-white]="!node.isStart && !node.isEnd" [class.z-40]="selectedNode()?.id === node.id"
                (mousedown)="onNodeMouseDown(node, $event)" (touchstart)="onNodeMouseDown(node, $event)" (dblclick)="onNodeDoubleClick(node, $event)">

            <div class="text-sm font-medium text-center break-words overflow-hidden px-2 py-1 max-w-full leading-tight pointer-events-none text-slate-800">
                {{ node.label }}
            </div>
            </div>
            }

        </div>
      </div>

      <input #fileInput type="file" (change)="onFileSelected($event)" class="hidden" accept=".json">

    </div>
  `,
  styles: [`
    @reference 'tailwindcss';

    *, *::before, *::after {
       @apply touch-manipulation;
    }

    html, body {
       @apply h-full w-full overflow-hidden overscroll-none bg-slate-50;
       position: fixed;
    }

    .animate-fadeInRight { animation: fadeInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    @keyframes fadeInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    * { @apply touch-manipulation; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #4f46e5; margin-top: -6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: grab; border: 2px solid white; }
    input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 4px; cursor: pointer; background: #e2e8f0; border-radius: 2px; }
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

  hitArea = computed(() => Math.min(50, 60 / this.zoomLevel()));
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
  panStartPos: Point | null = null; // To differentiate click vs drag on background
  panLastPos: Point = { x: 0, y: 0 };

  dragStartMouse: Point | null = null;     // Wo war die Maus beim Start?
  dragStartLinkCP: Point | null = null;    // Wo war der Kontrollpunkt beim Start?

  tempLink = signal<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  connectSourceId: string | null = null;
  cachedCanvasRect: DOMRect | null = null;
  Math = Math;

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

  @HostListener('document:dblclick', ['$event'])
  onGlobalDoubleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Allow default behavior (text selection) inside Inputs and Textareas
    if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
      return;
    }

    // Also allow behavior if the content is explicitly editable (contenteditable="true")
    if (target.isContentEditable) {
      return;
    }

    // For everything else (Sidebar background, Buttons, Canvas), block the Zoom.
    event.preventDefault();
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
      const tempJson = JSON.stringify(this.tempSnapshot);
      const currentJson = JSON.stringify(current);

      if (tempJson !== currentJson) {
          this.pushState(this.tempSnapshot);
          localStorage.setItem('fsm_db', currentJson);
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
    this.isSidebarOpen.set(false);
    this.isPanning = true;
    this.panLastPos = { x: clientX, y: clientY };
    this.panStartPos = { x: clientX, y: clientY }; // Record start to check for click vs drag
  }

private handleInteractionMove(clientX: number, clientY: number) {
    // ---------------------------------------------------------
    // 1. Panning
    // ---------------------------------------------------------
    if (this.isPanning) {
      const dx = clientX - this.panLastPos.x;
      const dy = clientY - this.panLastPos.y;
      this.viewOffset.update(v => ({ x: v.x + dx, y: v.y + dy }));
      this.panLastPos = { x: clientX, y: clientY };
      return;
    }

    const wp = this.getWorldPointFromClient(clientX, clientY);

    // ---------------------------------------------------------
    // 2. Node Dragging
    // ---------------------------------------------------------
    if (this.isDraggingNode && this.selectedNode()) {
      const node = this.selectedNode()!;
      const newX = wp.x - this.nodeGrabOffset.x;
      const newY = wp.y - this.nodeGrabOffset.y;
      const dx = newX - node.x;
      const dy = newY - node.y;
      node.x = newX;
      node.y = newY;

      // Move connected links along with the node
      this.links().forEach(link => {
        if (link.sourceId === node.id && link.targetId === node.id) {
          link.controlPoint.x += dx;
          link.controlPoint.y += dy;
        } else if (link.sourceId === node.id || link.targetId === node.id) {
          link.controlPoint.x += dx * 0.5;
          link.controlPoint.y += dy * 0.5;
        }
      });
      this.updateData();
      return;
    }

    // ---------------------------------------------------------
    // 3. Link Dragging (Robust Delta Logic + Mouse-To-Line Snap)
    // ---------------------------------------------------------
    if (this.isDraggingLineBody && this.selectedLink() && this.dragStartMouse && this.dragStartLinkCP) {
      const link = this.selectedLink()!;

      // Calculate how far the mouse has moved since the click (Delta)
      const mouseDx = wp.x - this.dragStartMouse.x;
      const mouseDy = wp.y - this.dragStartMouse.y;

      if (this.isSelfLoop(link)) {
        // For self-loops: 1:1 movement
        link.controlPoint.x = this.dragStartLinkCP.x + mouseDx;
        link.controlPoint.y = this.dragStartLinkCP.y + mouseDy;
      } else {
        const s = this.nodes().find(n => n.id === link.sourceId);
        const t = this.nodes().find(n => n.id === link.targetId);

        if (s && t) {
          const midX = (s.x + t.x) / 2;
          const midY = (s.y + t.y) / 2;

          // For quadratic curves, we must move the control point twice as far as
          // the mouse moves, so the peak visually follows the mouse cursor (Factor 2).
          let newCpX = this.dragStartLinkCP.x + (mouseDx * 2);
          let newCpY = this.dragStartLinkCP.y + (mouseDy * 2);

          // Check distance from MOUSE to the straight LINE (S -> T)
          // This is independent of the control point and works even close to the node
          const distToStraightLine = this.getDistanceFromLine(wp.x, wp.y, s.x, s.y, t.x, t.y);

          // If the mouse is closer than 15px to the direct connecting line -> Snap
          if (distToStraightLine < 15) {
            newCpX = midX;
            newCpY = midY;
          }

          link.controlPoint.x = newCpX;
          link.controlPoint.y = newCpY;
        }
      }
      this.updateData();
      return;
    }

    // ---------------------------------------------------------
    // 4. Create Connection (Connect Mode)
    // ---------------------------------------------------------
    if (this.connectSourceId) {
      this.tempLink.set({ ...this.tempLink()!, x2: wp.x, y2: wp.y });
    }
  }

  getDistanceFromLine(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
    const numerator = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
    const denominator = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));
    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  getLoopSpreadDegrees(link: FsmLink): number {
    const rad = link.spread || (Math.PI / 6);
    return Math.round(rad * (180 / Math.PI));
  }

  setLoopSpreadDegrees(link: FsmLink, degrees: number) {
    link.spread = degrees * (Math.PI / 180);
    this.updateData();
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

    // If we were panning (background interaction), and didn't move much (click), then deselect.
    if (this.isPanning && this.panStartPos) {
        const clientX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
        const clientY = event.changedTouches ? event.changedTouches[0].clientY : event.clientY;
        const dist = Math.sqrt(Math.pow(clientX - this.panStartPos.x, 2) + Math.pow(clientY - this.panStartPos.y, 2));

        // If movement is small (< 5px), treat as a CLICK on background -> Deselect
        if (dist < 5) {
            this.selectedNode.set(null);
            this.selectedLink.set(null);
            this.isSidebarOpen.set(false);
        }
        // If dist > 5, it was a pan, so we keep selection
    }

    this.isDraggingNode = false;
    this.isDraggingLineBody = false;
    this.isPanning = false;
    this.connectSourceId = null;
    this.tempLink.set(null);
    this.panStartPos = null;
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
    this.recordSnapshot();

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

    this.commitSnapshot();
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
    event.preventDefault();
    event.stopPropagation();

    this.recordSnapshot();
    this.isSidebarOpen.set(false);

    // Refresh canvas rect for precise world coordinates
    this.cachedCanvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();

    // Get mouse position in world coordinates
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const wp = this.getWorldPointFromClient(clientX, clientY);

    this.selectedLink.set(link);
    this.selectedNode.set(null);
    this.isDraggingLineBody = true;

    // We record where the mouse and the control point were at the moment of the click.
    this.dragStartMouse = { x: wp.x, y: wp.y };
    this.dragStartLinkCP = { x: link.controlPoint.x, y: link.controlPoint.y };
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
        controlPoint = { x: s.x, y: s.y - (s.size / 2 + 50) };
        spread = Math.PI / 6;
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
