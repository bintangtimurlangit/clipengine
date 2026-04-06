"use client";

import { CopyBlock } from "@/components/help/copy-block";
import { CHEAT_SHEET } from "@/lib/dashboard-content";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export function QuickReferenceTabs() {
  const first = CHEAT_SHEET[0]?.id ?? "import";

  return (
    <Tabs defaultValue={first} className="w-full">
      <TabsList variant="line" className="mb-3 h-auto w-full flex-wrap justify-start gap-1">
        {CHEAT_SHEET.map((c) => (
          <TabsTrigger key={c.id} value={c.id}>
            {c.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {CHEAT_SHEET.map((c) => (
        <TabsContent key={c.id} value={c.id} className="mt-0">
          <CopyBlock text={c.text} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
