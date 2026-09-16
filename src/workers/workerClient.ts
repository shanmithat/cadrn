/**
 * Main-thread client wrapper for cadWorker.ts.
 * Dispatches CAD parsing off-thread with promise-based API and progress tracking.
 */

import { ParsedMeshData } from '../core/cadParser';

export interface ParseWorkerProgressCallback {
  (percent: number, stage: string): void;
}

export class CADWorkerClient {
  private static worker: Worker | null = null;

  private static getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./cadWorker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  public static async parseCADFile(
    file: File,
    onProgress?: ParseWorkerProgressCallback
  ): Promise<{
    ingestionPath: 'parametric_brep' | 'discrete_mesh';
    meshData: ParsedMeshData;
    executionTimeMs: number;
  }> {
    const worker = this.getWorker();
    const buffer = await file.arrayBuffer();

    return new Promise((resolve, reject) => {
      const handleMessage = (e: MessageEvent) => {
        const data = e.data;

        if (data.status === 'progress') {
          if (onProgress) {
            onProgress(data.progress, data.stage);
          }
        } else if (data.status === 'success') {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          resolve({
            ingestionPath: data.ingestionPath,
            meshData: data.meshData,
            executionTimeMs: data.executionTimeMs,
          });
        } else if (data.status === 'error') {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          reject(new Error(data.error));
        }
      };

      const handleError = (err: ErrorEvent) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        reject(new Error(`Worker fatal error: ${err.message}`));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      worker.postMessage(
        {
          action: 'parse',
          fileName: file.name,
          buffer,
        },
        [buffer]
      );
    });
  }

  public static terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
