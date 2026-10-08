import { Sparkles, Zap, ShieldCheck, Check } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog'
import { buttonVariants } from './ui/button'

export function WhatsNewDialog(): React.JSX.Element | null {
  const whatsNew = useAppStore((store) => store.whatsNew)
  const dismissWhatsNew = useAppStore((store) => store.dismissWhatsNew)

  if (!whatsNew) return null

  return (
    <AlertDialog open={Boolean(whatsNew)} onOpenChange={(open) => !open && dismissWhatsNew()}>
      <AlertDialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto p-6 gap-5">
        <AlertDialogHeader className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="size-4" />
            </div>
            <span className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">
              Updated to v{whatsNew.version}
            </span>
          </div>
          <AlertDialogTitle className="font-sans text-lg font-bold tracking-tight text-foreground">
            {whatsNew.title || `What's New in UnCapped v${whatsNew.version}`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            Here are the latest features, performance enhancements, and fixes in this release.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 pt-1">
          {/* New Features */}
          {whatsNew.features && whatsNew.features.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase text-foreground">
                <Sparkles className="size-3.5 text-amber-400" />
                <span>New Features</span>
              </div>
              <ul className="space-y-1.5 pl-1">
                {whatsNew.features.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground"
                  >
                    <Check className="size-3.5 shrink-0 text-emerald-500 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Performance & Bonding */}
          {whatsNew.improvements && whatsNew.improvements.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-border/60">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase text-foreground">
                <Zap className="size-3.5 text-sky-400 fill-sky-400" />
                <span>Performance & Speed</span>
              </div>
              <ul className="space-y-1.5 pl-1">
                {whatsNew.improvements.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground"
                  >
                    <Check className="size-3.5 shrink-0 text-sky-500 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fixes & Stability */}
          {whatsNew.fixes && whatsNew.fixes.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-border/60">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase text-foreground">
                <ShieldCheck className="size-3.5 text-emerald-400" />
                <span>Fixes & Improvements</span>
              </div>
              <ul className="space-y-1.5 pl-1">
                {whatsNew.fixes.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground"
                  >
                    <Check className="size-3.5 shrink-0 text-emerald-500 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <AlertDialogFooter className="pt-2 border-t border-border/80">
          <AlertDialogAction
            onClick={dismissWhatsNew}
            className={buttonVariants({
              size: 'sm',
              className: 'w-full sm:w-auto font-medium cursor-pointer'
            })}
          >
            Got it, let&apos;s explore!
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
