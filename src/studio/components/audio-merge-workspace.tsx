import {useRef, useState} from 'react';

type AudioItem = {
  id: string;
  name: string;
  path: string;
};

type Props = {
  projectId: string;
};

const AUDIO_ACCEPT = '.wav,.mp3,.m4a,.aac,.flac,.ogg,audio/*';

export const AudioMergeWorkspace = ({projectId}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AudioItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [outputPath, setOutputPath] = useState('');

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setMessage(`正在上传 ${files.length} 条音频…`);
    const uploaded: AudioItem[] = [];
    try {
      for (const file of files) {
        const response = await fetch('/api/assets', {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
            'X-Target-Directory': encodeURIComponent('audio'),
          },
          body: file,
        });
        const value = (await response.json()) as {assetPath?: string; error?: string};
        if (!response.ok || !value.assetPath) {
          throw new Error(`${file.name}：${value.error ?? '上传失败'}`);
        }
        uploaded.push({
          id: `${Date.now()}-${uploaded.length}-${file.name}`,
          name: file.name,
          path: value.assetPath,
        });
      }
      setItems((current) => [...current, ...uploaded]);
      setOutputPath('');
      setMessage(`已添加 ${uploaded.length} 条音频，可调整合并顺序。`);
    } catch (error) {
      setItems((current) => [...current, ...uploaded]);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setOutputPath('');
  };

  const merge = async () => {
    if (items.length < 2) {
      setMessage('请至少添加两条音频。');
      return;
    }
    setBusy(true);
    setMessage(`正在按当前顺序合并 ${items.length} 条音频…`);
    try {
      const response = await fetch('/api/audio/merge-files', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({paths: items.map((item) => item.path)}),
      });
      const value = (await response.json()) as {audioPath?: string; error?: string};
      if (!response.ok || !value.audioPath) {
        throw new Error(value.error ?? '音频合并失败');
      }
      setOutputPath(value.audioPath);
      setMessage('音频合并完成，可以试听或下载。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const openLocation = async () => {
    if (!outputPath) return;
    const response = await fetch('/api/files/open-location', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({filePath: outputPath}),
    });
    if (!response.ok) {
      const value = (await response.json()) as {error?: string};
      setMessage(value.error ?? '无法打开音频所在目录');
    }
  };

  return (
    <section className="audio-merge-workspace">
      <header className="audio-merge-hero">
        <div>
          <span>音频工具</span>
          <h1>合并多条音频</h1>
          <p>上传多条音频，调整先后顺序，再合成为一条 MP3 文件。</p>
        </div>
        <button disabled={busy} onClick={() => inputRef.current?.click()}>
          ＋ 添加音频
        </button>
        <input
          ref={inputRef}
          hidden
          multiple
          type="file"
          accept={AUDIO_ACCEPT}
          onChange={(event) => {
            void uploadFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </header>

      <div className="audio-merge-grid">
        <section className="audio-merge-list-panel">
          <header>
            <div>
              <strong>待合并音频</strong>
              <span>{items.length} 条</span>
            </div>
            {items.length ? (
              <button
                disabled={busy}
                onClick={() => {
                  setItems([]);
                  setOutputPath('');
                  setMessage('列表已清空，已上传的原文件仍保留在项目音频目录。');
                }}
              >
                清空列表
              </button>
            ) : null}
          </header>
          {items.length ? (
            <div className="audio-merge-list">
              {items.map((item, index) => (
                <article key={item.id}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <div>
                    <strong>{item.name}</strong>
                    <audio controls preload="metadata" src={`/${projectId}/${item.path}`} />
                  </div>
                  <span className="audio-merge-order-actions">
                    <button disabled={busy || index === 0} onClick={() => move(index, -1)}>
                      ↑
                    </button>
                    <button
                      disabled={busy || index === items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setItems((current) => current.filter((entry) => entry.id !== item.id));
                        setOutputPath('');
                      }}
                    >
                      移除
                    </button>
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <button
              className="audio-merge-dropzone"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <b>♫</b>
              <strong>{busy ? '正在上传音频…' : '选择多条音频'}</strong>
              <span>支持 WAV、MP3、M4A、AAC、FLAC、OGG</span>
            </button>
          )}
        </section>

        <aside className="audio-merge-result-panel">
          <strong>合并结果</strong>
          <p>音频会按照左侧从上到下的顺序连续拼接。</p>
          <button
            className="audio-merge-submit"
            disabled={busy || items.length < 2}
            onClick={() => void merge()}
          >
            {busy ? '正在处理…' : `合并 ${items.length} 条音频`}
          </button>
          {outputPath ? (
            <div className="audio-merge-output">
              <audio controls src={`/${projectId}/${outputPath}`} />
              <a href={`/${projectId}/${outputPath}`} download>
                下载合并音频
              </a>
              <button onClick={() => void openLocation()}>打开所在目录</button>
            </div>
          ) : (
            <div className="audio-merge-empty-result">合并完成后可在这里试听和下载</div>
          )}
          {message ? <p className="audio-merge-message">{message}</p> : null}
        </aside>
      </div>
    </section>
  );
};
