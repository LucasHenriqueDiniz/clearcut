"use client";

import { useCallback, useEffect, useRef } from "react";
import { getJob } from "@/services/api";
import type { JobResponse } from "@/types";

const POLL_INTERVAL_MS = 700;
const TERMINAL_STATES = new Set(["done", "failed", "canceled"]);

export function isTerminalJobState(state: string): boolean {
  return TERMINAL_STATES.has(state);
}

type PollOptions = {
  onUpdate: (job: JobResponse) => void;
};

/**
 * Polls a job until it reaches a terminal state.
 *
 * The returned promise resolves with the final job, so callers can await
 * actual completion. Starting a new poll cancels the previous one, and
 * unmounting cancels whatever is in flight — otherwise each call would leave
 * its own timer chain running against shared state.
 */
export function useJobPolling({ onUpdate }: PollOptions) {
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const pollJob = useCallback(
    (jobId: string): Promise<JobResponse | undefined> => {
      stop();
      const controller = new AbortController();
      controllerRef.current = controller;

      return new Promise<JobResponse | undefined>((resolve, reject) => {
        const tick = async () => {
          if (controller.signal.aborted) {
            resolve(undefined);
            return;
          }
          try {
            const status = await getJob(jobId, controller.signal);
            if (controller.signal.aborted) {
              resolve(undefined);
              return;
            }
            onUpdateRef.current(status);
            if (isTerminalJobState(status.state)) {
              if (controllerRef.current === controller) controllerRef.current = null;
              resolve(status);
              return;
            }
            timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
          } catch (error) {
            if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
              resolve(undefined);
              return;
            }
            if (controllerRef.current === controller) controllerRef.current = null;
            reject(error);
          }
        };
        void tick();
      });
    },
    [stop],
  );

  return { pollJob, stopPolling: stop };
}
