import { PropsWithChildren } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void; title: string }>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
