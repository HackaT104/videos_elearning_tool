// Chạy máy chủ CIT giả lập ở cổng 8001 (khi chưa cài CIT Voice Studio, để thử luồng ứng dụng).
import { startMockCit } from "@cvs/tts";
const port = Number(process.env.PORT ?? 8001);
await startMockCit(port);
console.log(`CIT GIẢ LẬP đang chạy tại http://127.0.0.1:${port} – giọng chỉ là âm thử, KHÔNG phải giọng thật.`);
