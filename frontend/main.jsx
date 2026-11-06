import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

const API_URL = 'http://localhost:8000/api/chat';

function SketchApp() {
  const canvasRef = useRef(null);
  const hasDrawingRef = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    const resizeCanvas = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.lineWidth = 3;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.strokeStyle = '#0f172a';
      hasDrawingRef.current = false;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const getPosition = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
  };

  const startDrawing = (event) => {
    if (isSubmitting) return;
    const context = canvasRef.current.getContext('2d');
    const point = getPosition(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDrawing(true);
  };

  const continueDrawing = (event) => {
    if (!isDrawing) return;
    const context = canvasRef.current.getContext('2d');
    const point = getPosition(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    hasDrawingRef.current = true;
  };

  const stopDrawing = () => {
    const context = canvasRef.current.getContext('2d');
    context.closePath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    hasDrawingRef.current = false;
    setResult('');
  };

  const streamResponse = async (response) => {
    if (!response.body) {
      throw new Error('The backend did not return a stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let combinedText = '';

    const appendLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed);
        const content = parsed.message?.content ?? parsed.response;
        if (typeof content === 'string') {
          combinedText += content;
        }
      } catch {
        combinedText += trimmed;
      }

      setResult(combinedText);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) appendLine(line);
    }

    buffer += decoder.decode();
    if (buffer.trim()) appendLine(buffer);

    if (!combinedText) setResult('No response returned from the model.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasDrawingRef.current) {
      setResult('Draw a sketch before sending it.');
      return;
    }

    const image = canvasRef.current.toDataURL('image/png').split(',')[1];
    setIsSubmitting(true);
    setResult('Analyzing sketch...');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      await streamResponse(response);
    } catch (error) {
      setResult(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <form className="sketch-form" onSubmit={handleSubmit}>
        <div className="canvas-panel">
          <div className="canvas-card">
            <div className="canvas-wrapper">
              <canvas
                ref={canvasRef}
                onPointerDown={startDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
              />
            </div>
          </div>
        </div>
        <div className="action-row">
          <button className="secondary" type="button" onClick={clearCanvas} disabled={isSubmitting}>
            Clear sketch
          </button>
          <button className="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Analyzing...' : 'Analyze sketch'}
          </button>
        </div>
      </form>

      <section className="output-box" aria-live="polite">
        <h2>Analysis</h2>
        <div>{result}</div>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<SketchApp />);
