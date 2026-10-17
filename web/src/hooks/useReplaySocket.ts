/**
 * useReplaySocket.ts: Single global Socket.IO connection hook with automatic reconnection,
 * zod payload validation, and store dispatching.
 */

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ReplayStatusSchema,
  ReplayTickSchema,
  DecisionEventSchema,
  ReplayEventSchema,
  SettlementEventSchema,
} from "../contract";
import { useReplayStore } from "../store/useReplayStore";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

let globalSocket: Socket | null = null;

export function useReplaySocket() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const setConnection = useReplayStore((s) => s.setConnection);
  const addValidationError = useReplayStore((s) => s.addValidationError);
  const setReplayStatus = useReplayStore((s) => s.setReplayStatus);
  const handleDecision = useReplayStore((s) => s.handleDecision);
  const handleTick = useReplayStore((s) => s.handleTick);
  const handleEvent = useReplayStore((s) => s.handleEvent);
  const handleSettlement = useReplayStore((s) => s.handleSettlement);

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      });
    }

    const socket = globalSocket;
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnection("connected");
    });

    socket.on("disconnect", () => {
      setConnection("disconnected");
    });

    socket.on("connect_error", () => {
      setConnection("reconnecting");
    });

    // 1. Status event
    socket.on("status", (data: unknown) => {
      const res = ReplayStatusSchema.safeParse(data);
      if (!res.success) {
        addValidationError("status", res.error.message);
        return;
      }
      setReplayStatus(res.data);
    });

    // 2. Decision event
    socket.on("decision", (data: unknown) => {
      const res = DecisionEventSchema.safeParse(data);
      if (!res.success) {
        addValidationError("decision", res.error.message);
        return;
      }
      handleDecision(res.data);
    });

    // 3. Tick event
    socket.on("tick", (data: unknown) => {
      const res = ReplayTickSchema.safeParse(data);
      if (!res.success) {
        addValidationError("tick", res.error.message);
        return;
      }
      handleTick(res.data);
    });

    // 4. Alert / Break / Overdraft Event
    socket.on("event", (data: unknown) => {
      const res = ReplayEventSchema.safeParse(data);
      if (!res.success) {
        addValidationError("event", res.error.message);
        return;
      }
      handleEvent(res.data);
    });

    // 5. Settlement event
    socket.on("settlement", (data: unknown) => {
      const res = SettlementEventSchema.safeParse(data);
      if (!res.success) {
        addValidationError("settlement", res.error.message);
        return;
      }
      handleSettlement(res.data);

      // TanStack Query refetch after each settlement
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
    });

    return () => {
      // Don't disconnect global socket on component re-render to keep singleton alive
    };
  }, [
    queryClient,
    setConnection,
    addValidationError,
    setReplayStatus,
    handleDecision,
    handleTick,
    handleEvent,
    handleSettlement,
  ]);

  const startReplay = (fromNight?: string) => {
    socketRef.current?.emit("replay:start", fromNight ? { fromNight } : {});
  };

  const pauseReplay = () => {
    socketRef.current?.emit("replay:pause");
  };

  const resumeReplay = () => {
    socketRef.current?.emit("replay:resume");
  };

  const resetReplay = () => {
    socketRef.current?.emit("replay:reset");
  };

  const setSpeed = (tickMs: number) => {
    socketRef.current?.emit("replay:speed", { tickMs });
  };

  const seekNight = (
    nightDate: string,
    callback?: (res: { ok: boolean; error?: string }) => void
  ) => {
    socketRef.current?.emit("replay:seek", { nightDate }, callback);
  };

  const setConfig = (payload: {
    strategy?: string;
    mode?: "zero_overdraft" | "cost_optimal";
    quantile?: number;
    pool?: number;
  }) => {
    socketRef.current?.emit("config:set", payload);
  };

  return {
    socket: socketRef.current,
    startReplay,
    pauseReplay,
    resumeReplay,
    resetReplay,
    setSpeed,
    seekNight,
    setConfig,
  };
}
