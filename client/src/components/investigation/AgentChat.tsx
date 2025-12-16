import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMessages, sendMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, Send, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface AgentChatProps {
  investigationId: string;
}

export function AgentChat({ investigationId }: AgentChatProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', investigationId],
    queryFn: () => getMessages(investigationId),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendMessage(investigationId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', investigationId] });
      setInput('');
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sendMutation.isPending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      <ScrollArea className="flex-1 p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-4 animate-in-slide", msg.role === 'user' ? "justify-end" : "justify-start")}>
              {msg.role !== 'user' && (
                <Avatar className="h-8 w-8 border border-primary/50 bg-primary/10">
                  <AvatarFallback className="text-primary"><Bot className="h-4 w-4" /></AvatarFallback>
                </Avatar>
              )}
              
              <div className={cn(
                "max-w-[85%] rounded-lg p-4 text-sm leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-primary text-primary-foreground ml-12" 
                  : "bg-card border border-border text-foreground mr-12"
              )}>
                {msg.role === 'system' ? (
                   <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                      <Sparkles className="h-3 w-3" />
                      {msg.content}
                   </div>
                ) : (
                  <div className="markdown-body prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <Avatar className="h-8 w-8 border border-border bg-muted">
                  <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {/* Loading State */}
          {sendMutation.isPending && (
             <div className="flex gap-4 justify-start max-w-3xl animate-in-slide">
                <Avatar className="h-8 w-8 border border-primary/50 bg-primary/10">
                  <AvatarFallback className="text-primary"><Bot className="h-4 w-4" /></AvatarFallback>
                </Avatar>
                <div className="bg-card border border-border rounded-lg p-4 text-sm">
                   <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-muted-foreground">Kimi K2 is thinking...</span>
                   </div>
                </div>
             </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-background/95 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto relative">
          <form onSubmit={handleSubmit} className="relative flex items-center">
             <div className="absolute left-3 top-3 flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
             </div>
             <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Kimi to investigate, analyze, or summarize..."
                className="pl-8 pr-12 py-6 bg-muted/20 border-primary/20 focus-visible:ring-primary/50 font-mono text-sm shadow-[0_0_20px_rgba(0,0,0,0.1)]"
                autoFocus
                disabled={sendMutation.isPending}
             />
             <Button 
               type="submit" 
               size="icon" 
               className="absolute right-2 top-2 h-8 w-8 bg-primary hover:bg-primary/90 text-primary-foreground"
               disabled={!input.trim() || sendMutation.isPending}
             >
               <Send className="h-4 w-4" />
             </Button>
          </form>
          <div className="text-[10px] text-center mt-2 text-muted-foreground font-mono">
            Kimi Agent • Dpt of Karma OSINT • Secure Channel
          </div>
        </div>
      </div>
    </div>
  );
}
