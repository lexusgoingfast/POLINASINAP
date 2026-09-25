/* Agentation — панель заметок для Claude (agentation.com). Только для разработки.
   Подключается из index.html лишь на localhost; отключить на странице: ?annotate=0
   Агент получает заметки через MCP-сервер: claude mcp add agentation -- npx -y agentation-mcp server
   Сайт остаётся без сборки, поэтому React и Agentation берутся с CDN, версии закреплены. */
import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import { Agentation } from 'https://esm.sh/agentation@3.1.2?deps=react@18.3.1,react-dom@18.3.1';

const host = document.createElement('div');
host.id = 'agentation-root';
document.body.append(host);
createRoot(host).render(React.createElement(Agentation, { endpoint: 'http://localhost:4747' }));
