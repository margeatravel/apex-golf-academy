import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Sparkles, Plus, MessageSquare, ChevronDown, X, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string | null;
  student_context_id: string | null;
  updated_at: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

interface Props {
  /** Optional currently-selected student to use as context. */
  studentContextId?: string;
  studentContextName?: string;
  onClearStudentContext?: () => void;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-ai-chat`;

export function CoachAiChat({ studentContextId, studentContextName, onClearStudentContext }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["coach-ai-conversations", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_ai_conversations")
        .select("id, title, student_context_id, updated_at")
        .eq("coach_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Conversation[];
    },
  });

  // Auto-pick the most recent conversation on first load only.
  // After clicking New, activeId is intentionally null so the blank chat stays open.
  useEffect(() => {
    if (activeId === undefined && conversations.length > 0) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  const { data: messages = [], isLoading: loadingMsgs } = useQuery<Message[]>({
    queryKey: ["coach-ai-messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_ai_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", activeId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText]);

  const startNew = () => {
    setActiveId(null);
    setDraft("");
    setStreamText("");
    setPendingMessages([]);
    setShowHistory(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const send = async () => {
    const message = draft.trim();
    if (!message || streaming) return;
    setDraft("");
    setStreaming(true);
    setStreamText("");

    // Optimistic user bubble
    const tempUserMsg: Message = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };
    if (activeId) {
      queryClient.setQueryData<Message[]>(["coach-ai-messages", activeId], (old = []) => [
        ...old,
        tempUserMsg,
      ]);
    } else {
      setPendingMessages((old) => [...old, tempUserMsg]);
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const resp = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: activeId ?? null,
          message,
          student_context_id: studentContextId ?? null,
        }),
      });

      if (!resp.ok || !resp.body) {
        let errMsg = `Request failed (${resp.status})`;
        try {
          const j = await resp.json();
          if (j?.error) errMsg = j.error;
        } catch {/* ignore */}
        throw new Error(errMsg);
      }

      const newConvId = resp.headers.get("X-Conversation-Id");
      if (newConvId && newConvId !== activeId) {
        setActiveId(newConvId);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assembled = "";
      let done = false;
      while (!done) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || !line.trim()) continue;
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              assembled += delta;
              setStreamText(assembled);
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      // Refresh messages + conversations from DB
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["coach-ai-messages", newConvId ?? activeId] }),
        queryClient.invalidateQueries({ queryKey: ["coach-ai-conversations", user?.id] }),
      ]);
      setStreamText("");
      setPendingMessages([]);
    } catch (e: any) {
      setStreamText("");
      // Show error as an assistant bubble
      if (activeId) {
        queryClient.setQueryData<Message[]>(["coach-ai-messages", activeId], (old = []) => [
          ...old,
          {
            id: `temp-err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${e?.message || "Something went wrong."}`,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        setPendingMessages((old) => [
          ...old,
          {
            id: `temp-err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${e?.message || "Something went wrong."}`,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setStreaming(false);
    }
  };

  const visibleMessages = activeId ? messages : pendingMessages;
  const showEmpty = visibleMessages.length === 0 && !streamText;

  const activeConv = useMemo(() => conversations.find((c) => c.id === activeId), [conversations, activeId]);

  return (
    <div className="flex h-full min-h-0 max-h-full w-full min-w-0 flex-col overflow-hidden">
      {/* Top bar: conversation switcher + new */}
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[#F5F0E8] text-sm"
        >
          <span className="flex items-center gap-2 min-w-0 truncate">
            <MessageSquare className="h-4 w-4 text-[#F0C040] shrink-0" />
            <span className="truncate">{activeConv?.title || "New conversation"}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", showHistory && "rotate-180")} />
        </button>
        <button
          onClick={startNew}
          className="shrink-0 px-3 py-2 rounded-lg bg-[#4a7c59] text-[#F5F0E8] text-sm font-medium flex items-center gap-1.5 hover:bg-[#4a7c59]/80"
          title="New conversation"
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </button>
      </div>

      {showHistory && (
        <div className="mb-3 max-h-48 overflow-y-auto rounded-lg bg-black/40 border border-white/10 divide-y divide-white/5">
          {conversations.length === 0 ? (
            <p className="p-3 text-xs text-[#F5F0E8]/50">No previous conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveId(c.id); setShowHistory(false); setStreamText(""); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm text-[#F5F0E8] hover:bg-white/5 flex items-center justify-between gap-2",
                  c.id === activeId && "bg-white/5"
                )}
              >
                <span className="truncate">{c.title || "Untitled"}</span>
                <span className="text-[10px] text-[#F5F0E8]/40 shrink-0">
                  {new Date(c.updated_at).toLocaleDateString()}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Student context chip */}
      {studentContextId && studentContextName && (
        <div className="mb-2 inline-flex max-w-full items-center gap-1.5 self-start text-[11px] px-2 py-1 rounded-full bg-[#F0C040]/10 border border-[#F0C040]/30 text-[#F0C040]">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">Context: {studentContextName}</span>
          {onClearStudentContext && (
            <button onClick={onClearStudentContext} className="ml-1 shrink-0 hover:text-[#F5F0E8]" title="Clear context">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden rounded-lg bg-black/30 border border-white/10 p-3 space-y-3"
      >
        {loadingMsgs && activeId ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#F5F0E8]/40" />
          </div>
        ) : showEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 space-y-2">
            <Sparkles className="h-8 w-8 text-[#F0C040]" />
            <h3 className="text-[#F5F0E8] font-semibold">Apex AI for Coaches</h3>
            <p className="text-[#F5F0E8]/55 text-xs max-w-sm">
              Ask for drills, draft a follow-up message to a student, summarize a student's recent AI sessions, or
              get advice on positioning the Pro plan.
            </p>
          </div>
        ) : (
          <>
            {visibleMessages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {streamText && <MessageBubble role="assistant" content={streamText} streaming />}
            {streaming && !streamText && (
              <div className="flex items-center gap-2 text-xs text-[#F5F0E8]/50">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the AI anything…"
          rows={2}
          className="flex-1 resize-none rounded-lg bg-white/5 border border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 px-3 py-2 text-sm focus:outline-none focus:border-[#F0C040]/40"
          disabled={streaming}
        />
        <button
          onClick={send}
          disabled={!draft.trim() || streaming}
          className="h-10 w-10 rounded-lg bg-[#F0C040] text-[#0d1f18] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full min-w-0", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-full sm:max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words [overflow-wrap:anywhere]",
          isUser
            ? "bg-[#4a7c59] text-[#F5F0E8] rounded-br-sm"
            : "bg-white/8 text-[#F5F0E8] border border-white/10 rounded-bl-sm"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none break-words [overflow-wrap:anywhere] [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-[#F0C040] [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
            <ReactMarkdown>{content}</ReactMarkdown>
            {streaming && <span className="inline-block w-1.5 h-4 align-middle bg-[#F0C040]/70 animate-pulse ml-0.5" />}
          </div>
        )}
      </div>
    </div>
  );
}