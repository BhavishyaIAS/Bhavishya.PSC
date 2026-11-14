"use client";

import { useEffect } from "react";

import { setSceneOverride } from "./Backdrop";
import type { SceneName } from "./scenes";

/** Rendered by a page to choose its 3D backdrop (e.g. the globe on a Geography topic). */
export function SceneHint({ scene }: { scene: SceneName }) {
  useEffect(() => {
    setSceneOverride(scene);
    return () => setSceneOverride(null);
  }, [scene]);
  return null;
}
