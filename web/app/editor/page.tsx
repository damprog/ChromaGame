export default function EditorPage() {
  return (
    <div className="h-dvh flex">
      <aside className="w-72 border-r p-4">
        <div className="font-semibold">Tools</div>
        <div className="text-sm text-muted-foreground">Paleta / właściwości</div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center gap-2">
          <div className="font-semibold">ChromaGame Editor</div>
          <div className="ml-auto text-sm text-muted-foreground">/editor</div>
        </header>

        <div className="flex-1 p-4">
          <div className="h-full rounded-md border flex items-center justify-center text-muted-foreground">
            Canvas placeholder
          </div>
        </div>
      </main>
    </div>
  );
}
