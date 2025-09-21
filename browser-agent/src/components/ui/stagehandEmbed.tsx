"use client";

interface StagehandEmbedProps {
  debugUrl: string | null;
}

export function StagehandEmbed({ debugUrl }: StagehandEmbedProps) {
  return (
    <div className="flex-1 bg-black/80 flex flex-col items-center justify-center text-blue-300">
      {debugUrl ? (
        <iframe src={debugUrl} className="w-full h-full" />
      ) : (
        <p>No browser session active</p>
      )}
    </div>
  );
}
