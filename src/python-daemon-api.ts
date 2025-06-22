import { PythonDaemon } from './python-daemon';

export async function callDaemonQuickEdit(text: string): Promise<string | null> {
  try {
    const daemon = await PythonDaemon.getInstance();
    const result = await daemon.quickEdit(text);
    return typeof result === 'string' ? result : null;
  } catch (err) {
    console.error('❌ Python daemon quick edit failed:', (err as Error).message);
    return null;
  }
} 