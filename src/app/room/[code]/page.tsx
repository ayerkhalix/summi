import { GameApp } from "@/components/game-app";
export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return <GameApp initialCode={(await params).code.toUpperCase()} />;
}
