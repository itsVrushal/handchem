/**
 * events.ts
 * Unified input-event union and lightweight publish/subscribe bus.
 * Every input source (gesture engine, mouse adapter) emits these same
 * event shapes so the rest of the app never touches raw landmarks or
 * DOM event objects.
 *
 * Position coordinates are always normalised screen coords: x,y ∈ [0,1].
 */

export type Point2D = { x: number; y: number };
export type InputSource = 'gesture' | 'mouse';

type Base = { position: Point2D; timestamp: number; source: InputSource };

/** Discriminated union of every event the input layer can emit. */
export type InputEvent =
  | (Base & { type: 'move' })
  | (Base & { type: 'hover'; targetId?: string })
  | (Base & { type: 'click'; targetId?: string })
  | (Base & { type: 'dragStart'; targetId?: string })
  | (Base & { type: 'drag'; delta: Point2D })
  | (Base & { type: 'dragEnd' })
  | (Base & { type: 'orbit'; delta: Point2D })
  | (Base & { type: 'zoom'; factor: number; angle?: number })
  | (Base & { type: 'swipe'; direction: 'left' | 'right' })
  | (Base & { type: 'cancel'; reason: string });

export type InputEventType = InputEvent['type'];

type ListenerFor<T extends InputEventType> = (e: Extract<InputEvent, { type: T }>) => void;

/**
 * Minimal type-safe pub/sub bus.
 * Returns an unsubscribe function from both `on` and `onAny`.
 */
export class EventBus {
  private readonly map = new Map<string, Set<(e: InputEvent) => void>>();

  on<T extends InputEventType>(type: T, listener: ListenerFor<T>): () => void {
    if (!this.map.has(type)) this.map.set(type, new Set());
    const fn = listener as (e: InputEvent) => void;
    this.map.get(type)!.add(fn);
    return () => this.map.get(type)?.delete(fn);
  }

  onAny(listener: (e: InputEvent) => void): () => void {
    if (!this.map.has('*')) this.map.set('*', new Set());
    this.map.get('*')!.add(listener);
    return () => this.map.get('*')?.delete(listener);
  }

  emit(event: InputEvent): void {
    this.map.get(event.type)?.forEach((fn) => fn(event));
    this.map.get('*')?.forEach((fn) => fn(event));
  }
}
