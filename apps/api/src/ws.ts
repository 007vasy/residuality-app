import type { WebSocket } from "@fastify/websocket";

/** Project rooms for live collaboration. Server broadcasts change notifications. */
const rooms = new Map<string, Set<WebSocket>>();

export interface ChangeEvent {
  type: "changed";
  projectId: string;
  resources: string[];
}

export function joinRoom(projectId: string, socket: WebSocket): void {
  let set = rooms.get(projectId);
  if (!set) {
    set = new Set();
    rooms.set(projectId, set);
  }
  set.add(socket);
}

export function leaveRoom(projectId: string, socket: WebSocket): void {
  const set = rooms.get(projectId);
  if (set) {
    set.delete(socket);
    if (set.size === 0) rooms.delete(projectId);
  }
}

/** Notify all collaborators in a project that some resources changed → refetch. */
export function broadcastChange(projectId: string, resources: string[]): void {
  const set = rooms.get(projectId);
  if (!set) return;
  const payload = JSON.stringify({ type: "changed", projectId, resources } satisfies ChangeEvent);
  for (const socket of set) {
    try {
      socket.send(payload);
    } catch {
      /* drop broken sockets on next close */
    }
  }
}
