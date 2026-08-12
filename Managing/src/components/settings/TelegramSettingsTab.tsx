import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTelegramStatus, saveTelegramConfig, sendCustomTelegram } from "@/server-functions/notification.functions";

const TELEGRAM_STATUS_QUERY_KEY = ["tg-status"] as const;

/**
 * Telegram configuration is isolated from the route because it owns a complete
 * data flow: status query, form state, save mutation, and connection test.
 */
export function TelegramSettingsTab() {
  const fetchStatus = useServerFn(getTelegramStatus);
  const save = useServerFn(saveTelegramConfig);
  const sendTest = useServerFn(sendCustomTelegram);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: TELEGRAM_STATUS_QUERY_KEY,
    queryFn: () => fetchStatus(),
  });

  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");

  useEffect(() => {
    if (data?.chat_id) setChatId(data.chat_id);
  }, [data?.chat_id]);

  const saveConfig = useMutation({
    mutationFn: () => save({ data: { bot_token: botToken || null, chat_id: chatId || null } }),
    onSuccess: () => {
      toast.success("Đã lưu cấu hình Telegram");
      queryClient.invalidateQueries({ queryKey: TELEGRAM_STATUS_QUERY_KEY });
      setBotToken("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testConnection = useMutation({
    mutationFn: () => sendTest({ data: { text: "🔔 Test kết nối Telegram từ hệ thống Quản lý học sinh." } }),
    onSuccess: () => toast.success("Đã gửi tin nhắn thử"),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="max-w-2xl shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" aria-hidden="true" />
          Cấu hình Telegram
        </CardTitle>
        <CardDescription>
          Trạng thái:{" "}
          {data?.configured ? (
            <span className="font-semibold text-[color:var(--success)]">Đã cấu hình</span>
          ) : (
            <span className="text-muted-foreground">Chưa cấu hình</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1">
          <Label htmlFor="telegram-bot-token">Bot Token</Label>
          <Input
            id="telegram-bot-token"
            type="password"
            placeholder={data?.configured ? "•••••••••• (để trống nếu không đổi)" : "123456:ABC-..."}
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="telegram-chat-id">Chat ID nhóm</Label>
          <Input
            id="telegram-chat-id"
            placeholder="-1001234567890"
            value={chatId}
            onChange={(event) => setChatId(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
            {saveConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Lưu cấu hình
          </Button>
          <Button
            variant="outline"
            onClick={() => testConnection.mutate()}
            disabled={testConnection.isPending || !data?.configured}
          >
            {testConnection.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Gửi thử
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
