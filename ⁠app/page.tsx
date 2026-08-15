'use client';

import { useState, useRef, useEffect } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState('deepseek');
  const [systemPrompt, setSystemPrompt] = useState('你是一个专业的AI助手。');
  const [isLoading, setIsLoading] = useState(false);
  const [requestId, setRequestId] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // 添加一个空的 assistant 消息用于流式填充
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          systemPrompt,
          messages: newMessages,
        }),
      });

      const reqId = response.headers.get('X-Request-ID');
      if (reqId) setRequestId(reqId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      if (!response.body) {
        throw new Error('未收到响应流');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') break;

          try {
            const json = JSON.parse(dataStr);

            if (json.type === 'delta') {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + json.content,
                };
                return updated;
              });
            } else if (json.type === 'error') {
              throw new Error(json.error);
            }
          } catch (err: any) {
            console.error('解析 SSE 数据出错:', err);
          }
        }
      }
    } catch (error: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `[错误]: ${error.message || '网络或服务异常'}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col h-screen max-w-4xl mx-auto p-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* 顶部控制栏 */}
      <header className="flex flex-wrap gap-4 items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-4">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-sm">Provider:</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="border rounded px-2 py-1 bg-transparent text-sm"
          >
            <option value="deepseek">DeepSeek</option>
            <option value="still">Still</option>
            <option value="agent">Agent</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-md">
          <label className="font-semibold text-sm">System:</label>
          <input
            type="text"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="border rounded px-2 py-1 flex-1 text-sm bg-transparent"
          />
        </div>

        {requestId && (
          <span className="text-xs text-gray-400">ID: {requestId}</span>
        )}
      </header>

      {/* 聊天内容展示区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-gray-800 rounded-lg shadow-inner mb-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            有什么我可以帮你的吗？
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入框 */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的问题..."
          disabled={isLoading}
          className="flex-1 border rounded-lg px-4 py-3 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-medium text-sm transition-colors"
        >
          {isLoading ? '思考中...' : '发送'}
        </button>
      </form>
    </main>
  );
}
