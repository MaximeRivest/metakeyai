const { ipcRenderer } = require('electron');

const canvas = document.getElementById('visualizerCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

const WIDTH = 200;
const HEIGHT = 60;
canvas.width = WIDTH;
canvas.height = HEIGHT;

function draw(data: Int16Array) {
    if (!ctx) return;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();

    const sliceWidth = WIDTH * 1.0 / data.length;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
        const v = data[i] / 32768.0; // PCM 16-bit is -32768 to 32767
        const y = (v * HEIGHT) / 2 + HEIGHT / 2;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
}

ipcRenderer.on('audio-data', (event: any, data: Buffer) => {
    // The incoming data is a Buffer, we need to interpret it as 16-bit signed integers
    const int16Array = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    draw(int16Array);
});

// Initial clear
ctx?.clearRect(0, 0, WIDTH, HEIGHT); 