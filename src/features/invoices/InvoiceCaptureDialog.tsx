import { CameraIcon, FileUpIcon, ImageIcon, Loader2Icon, PencilLineIcon, RotateCwIcon, ScanLineIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { toast } from 'sonner'
import { useRepository } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Progress } from '@/components/ui/progress'
import { TRANSACTION_DEFAULTS } from '@/data/repository'
import { useFinance } from '@/data/DataProvider'
import type { InvoiceInput } from '@/domain/types'
import { useI18n, type MessageKey } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { errorKey } from '@/lib/errors'
import { checkInvoiceFile, MAX_PDF_PAGES, sha256Hex } from '@/lib/files'
import type { Region } from '@/lib/invoice/extract'
import { OcrCancelledError, type OcrLanguage, type OcrProgress } from '@/lib/invoice/ocr'
import { InvoiceForm, type InvoiceFormInitial, type InvoiceFormOutput } from './InvoiceForm'
import { NotStructuredError, readDocument, type ReadResult } from './readDocument'

type Step = 'choose' | 'preview' | 'reading' | 'review'
type Crop = { x: number; y: number; width: number; height: number }
const REGIONS: Region[] = ['auto', 'eg', 'gcc', 'eu', 'us', 'uk', 'in', 'other']

function emptyField<T>() {
  return { value: null as T | null, source: null }
}

function initialFrom(result: ReadResult | null, currency: string): InvoiceFormInitial {
  if (!result) {
    return {
      kind: 'receipt',
      merchant: emptyField(),
      merchantAddress: emptyField(),
      merchantTaxId: emptyField(),
      invoiceNumber: emptyField(),
      issueDate: { value: todayIso(), source: null },
      dueDate: emptyField(),
      currency: { value: currency, source: null },
      subtotalMinor: emptyField(),
      discountMinor: emptyField(),
      taxMinor: emptyField(),
      totalMinor: emptyField(),
      categoryId: '',
      status: 'unpaid',
      paymentMethod: null,
      warrantyUntil: '',
      returnBy: '',
      notes: '',
    }
  }
  return {
    kind: result.kind,
    merchant: result.merchant,
    merchantAddress: result.merchantAddress,
    merchantTaxId: result.merchantTaxId,
    invoiceNumber: result.invoiceNumber,
    issueDate: result.issueDate,
    dueDate: result.dueDate,
    currency: result.currency.value ? result.currency : { value: currency, source: null },
    subtotalMinor: result.subtotalMinor,
    discountMinor: result.discountMinor,
    taxMinor: result.taxMinor,
    totalMinor: result.totalMinor,
    categoryId: '',
    status: 'unpaid',
    paymentMethod: null,
    warrantyUntil: '',
    returnBy: '',
    notes: '',
  }
}

const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export function InvoiceCaptureDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('capture.title')}</DialogTitle>
          <DialogDescription>{t('capture.text')}</DialogDescription>
        </DialogHeader>
        {open ? <Capture onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Capture({ onDone }: { onDone(): void }) {
  const { t, language } = useI18n()
  const repo = useRepository()
  const { settings } = useFinance()
  const [step, setStep] = useState<Step>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [fileType, setFileType] = useState<Awaited<ReturnType<typeof checkInvoiceFile>> | null>(null)
  const [sha, setSha] = useState<string | null>(null)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [languages, setLanguages] = useState<'both' | 'ara' | 'eng'>(language === 'ar' ? 'both' : 'both')
  const [region, setRegion] = useState<Region>('auto')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const [result, setResult] = useState<ReadResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [invoiceId] = useState(() => repo.newId())
  const [txId] = useState(() => repo.newId())
  const isImage = fileType?.ok && fileType.type.startsWith('image/')
  const previewUrl = useMemo(() => (file && isImage ? URL.createObjectURL(file) : null), [file, isImage])
  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl])
  useEffect(() => () => abortRef.current?.abort(), [])

  const accept = async (picked: File | undefined) => {
    if (!picked) return
    setError(null)
    const check = await checkInvoiceFile(picked)
    if (!check.ok) {
      setError(check.reason === 'too-large' ? 'capture.tooLarge' : check.reason === 'empty' ? 'capture.empty' : 'capture.unsupported')
      return
    }
    setFile(picked)
    setFileType(check)
    setRotation(0)
    setCrop(null)
    setSha(await sha256Hex(await picked.arrayBuffer()))
    // Structured files have nothing to preview; read them straight away.
    if (check.type === 'application/json' || check.type === 'application/xml') void read(picked, check.type)
    else setStep('preview')
  }

  const read = async (target = file, type = fileType?.ok ? fileType.type : null) => {
    if (!target || !type) return
    const controller = new AbortController()
    abortRef.current = controller
    setStep('reading')
    setError(null)
    setProgress(null)
    try {
      const langs: OcrLanguage[] = languages === 'both' ? ['ara', 'eng'] : [languages]
      const r = await readDocument(target, type, { languages: langs, region, fallbackCurrency: settings.displayCurrency, rotation, crop: rotation === 0 ? (crop ?? undefined) : undefined }, setProgress, controller.signal)
      setResult(r)
      setStep('review')
    } catch (e) {
      if (e instanceof OcrCancelledError) setError('capture.cancelled')
      else if (e instanceof NotStructuredError) setError('capture.notStructured')
      else setError('capture.failed')
      setStep(type === 'application/json' || type === 'application/xml' ? 'choose' : 'preview')
    } finally {
      abortRef.current = null
    }
  }

  const save = async (output: InvoiceFormOutput, recordExpense: boolean) => {
    setSaving(true)
    try {
      let storagePath = ''
      if (file && sha && fileType?.ok) storagePath = await repo.saveInvoiceFile(invoiceId, file, file.name, sha)
      const input: InvoiceInput = {
        ...output,
        status: recordExpense ? 'paid' : output.status,
        taxLines: result?.taxLines ?? [],
        lines: (result?.lines ?? []).slice(0, 200),
        qrText: (result?.qrText ?? '').slice(0, 2000),
        extraction: result?.method ?? 'manual',
        rawText: (result?.rawText ?? '').slice(0, 20000),
        linkedTransactionIds: recordExpense ? [txId] : [],
        file:
          file && sha && fileType?.ok
            ? { name: file.name.slice(0, 200), type: fileType.type, size: file.size, sha256: sha, storagePath }
            : null,
      }
      if (recordExpense) {
        await repo.createTransaction(txId, {
          ...TRANSACTION_DEFAULTS,
          type: 'expense',
          description: (output.merchant || output.invoiceNumber || t('invoices.title')).slice(0, 120),
          amountMinor: output.totalMinor,
          currency: output.currency,
          categoryId: output.categoryId ?? 'exp-other',
          date: output.issueDate ?? todayIso(),
          paymentMethod: output.paymentMethod,
          origin: 'invoice',
          sourceRef: output.invoiceNumber || null,
          invoiceId,
        })
      }
      await repo.create('invoices', invoiceId, input)
      toast.success(t('invoices.created'))
      onDone()
    } catch (e) {
      toast.error(`${t('toast.couldNotSave')} ${t(errorKey(e))}`)
    } finally {
      setSaving(false)
    }
  }

  if (step === 'review') {
    return (
      <div className="grid gap-4">
        {result ? <ReadSummary result={result} /> : null}
        <InvoiceForm
          initial={initialFrom(result, settings.displayCurrency)}
          showSources={result !== null}
          sha256={sha}
          pending={saving}
          submitLabel={t('capture.saveInvoice')}
          secondaryLabel={t('capture.saveAndRecord')}
          onSubmit={(output, secondary) => void save(output, secondary)}
          onCancel={onDone}
        />
        <p className="text-xs text-muted-foreground">{t('capture.recordHint')}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p role="alert" className="rounded-md bg-expense-soft px-3 py-2 text-sm">
          {t(error)}
        </p>
      ) : null}

      {step === 'choose' ? (
        <>
          <div
            onDragOver={(e: DragEvent) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              setDragOver(false)
              void accept(e.dataTransfer.files[0])
            }}
            className={`hidden flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm md:flex ${dragOver ? 'border-primary bg-primary/5' : ''}`}
          >
            <FileUpIcon className="size-8 text-muted-foreground" aria-hidden="true" />
            <p>{t('capture.dropHere')}</p>
            <FilePickButton accept="image/jpeg,image/png,image/webp,application/pdf,.json,.xml,application/json,application/xml" onPick={accept} label={t('capture.chooseFile')} />
          </div>
          <div className="grid gap-2 md:hidden">
            {coarsePointer() ? (
              <>
                <FilePickButton accept="image/*" capture="environment" onPick={accept} label={t('capture.takePhoto')} icon={<CameraIcon />} />
                <p className="text-xs text-muted-foreground">{t('capture.cameraNote')}</p>
              </>
            ) : null}
            <FilePickButton accept="image/*" onPick={accept} label={t('capture.choosePhoto')} icon={<ImageIcon />} variant="outline" />
            <FilePickButton accept="image/jpeg,image/png,image/webp,application/pdf,.json,.xml,application/json,application/xml" onPick={accept} label={t('capture.chooseFile')} icon={<FileUpIcon />} variant="outline" />
          </div>
          <p className="text-xs text-muted-foreground">{t('capture.accepted', { pages: MAX_PDF_PAGES })}</p>
          <Button variant="ghost" className="justify-self-start" onClick={() => setStep('review')}>
            <PencilLineIcon /> {t('capture.manual')}
          </Button>
        </>
      ) : null}

      {step === 'preview' && file ? (
        <>
          {previewUrl ? <CropPreview src={previewUrl} rotation={rotation} crop={crop} onCrop={setCrop} /> : <p className="rounded-lg border p-4 text-sm">{file.name}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label htmlFor="ocr-lang" className="text-xs text-muted-foreground">
                {t('capture.language')}
              </Label>
              <NativeSelect id="ocr-lang" value={languages} onChange={(e) => setLanguages(e.target.value as typeof languages)}>
                <option value="both">{t('capture.langBoth')}</option>
                <option value="ara">{t('capture.langAr')}</option>
                <option value="eng">{t('capture.langEn')}</option>
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ocr-region" className="text-xs text-muted-foreground">
                {t('capture.region')}
              </Label>
              <NativeSelect id="ocr-region" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`capture.regions.${r}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {isImage ? (
              <div className="flex items-end gap-2">
                <Button type="button" variant="outline" onClick={() => {
                    setRotation((r) => ((r + 90) % 360) as typeof r)
                    setCrop(null)
                  }}>
                  <RotateCwIcon /> {t('capture.rotate')}
                </Button>
                {crop ? (
                  <Button type="button" variant="ghost" onClick={() => setCrop(null)}>
                    <XIcon /> {t('capture.resetCrop')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {isImage ? <p className="text-xs text-muted-foreground">{t('capture.cropHint')}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setStep('choose')}>
              {t('capture.another')}
            </Button>
            <Button onClick={() => void read()}>
              <ScanLineIcon /> {t('capture.read')}
            </Button>
          </div>
        </>
      ) : null}

      {step === 'reading' ? (
        <div className="grid gap-3" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            {progress ? t(`capture.stages.${progress.stage}`, { page: progress.page ?? 1, pages: progress.pages ?? 1 }) : t('common.loading')}
          </p>
          <Progress value={progress?.progress != null ? progress.progress * 100 : 5} aria-label={t('common.loading')} />
          <Button variant="outline" className="justify-self-end" onClick={() => abortRef.current?.abort()}>
            {t('capture.cancel')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function FilePickButton({
  accept,
  capture,
  onPick,
  label,
  icon,
  variant = 'default',
}: {
  accept: string
  capture?: 'environment'
  onPick(file: File | undefined): void
  label: string
  icon?: React.ReactNode
  variant?: 'default' | 'outline'
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button type="button" variant={variant} onClick={() => ref.current?.click()}>
        {icon}
        {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          onPick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}

/** Image preview with drag-to-select cropping (stored as fractions of the rotated image). */
function CropPreview({ src, rotation, crop, onCrop }: { src: string; rotation: number; crop: Crop | null; onCrop(crop: Crop | null): void }) {
  const box = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<Crop | null>(null)
  const point = (e: PointerEvent) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) }
  }
  const shown = draft ?? crop
  return (
    <div className="flex justify-center rounded-lg border bg-muted/40 p-2">
      <div
        ref={box}
        className="relative max-h-[45dvh] touch-none select-none"
        onPointerDown={(e) => {
          // Cropping is offered on the unrotated image only, so selections map exactly onto the file.
          if (rotation !== 0) return
          start.current = point(e)
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!start.current) return
          const p = point(e)
          setDraft({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), width: Math.abs(p.x - start.current.x), height: Math.abs(p.y - start.current.y) })
        }}
        onPointerUp={() => {
          if (draft && draft.width > 0.05 && draft.height > 0.05) onCrop(draft)
          start.current = null
          setDraft(null)
        }}
      >
        <img src={src} alt="" className="max-h-[45dvh] w-auto object-contain" style={{ transform: `rotate(${rotation}deg)` }} draggable={false} />
        {shown ? (
          <div
            className="pointer-events-none absolute border-2 border-primary bg-primary/10"
            style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.width * 100}%`, height: `${shown.height * 100}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

function ReadSummary({ result }: { result: ReadResult }) {
  const { t } = useI18n()
  const qrKey: MessageKey | null = result.qr
    ? result.qr.kind === 'eta-link'
      ? 'capture.qrEta'
      : result.qr.kind === 'zatca'
        ? 'capture.qrZatca'
        : result.qr.kind === 'url'
          ? 'capture.qrUrl'
          : 'capture.qrText'
    : null
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{t('capture.review')}</p>
      <p className="text-muted-foreground">{t('capture.reviewText')}</p>
      <ul className="grid gap-1 text-xs text-muted-foreground">
        <li>{t('capture.method', { method: t(`invoices.extraction.${result.method}`) })}</li>
        {result.engineConfidence !== null ? <li>{t('capture.engineConfidence', { value: result.engineConfidence })}</li> : null}
        <li>
          {qrKey ? `${t('capture.qrFound')} — ${t(qrKey)}` : t('capture.qrNone')}
          {result.qr?.kind === 'eta-link' && result.qr.url ? (
            <>
              {' '}
              <a href={result.qr.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
                {t('invoices.openPortal')}
              </a>
            </>
          ) : null}
        </li>
      </ul>
      {result.qr ? <p className="text-xs text-muted-foreground">{t('invoices.verifyNote')}</p> : null}
    </div>
  )
}
