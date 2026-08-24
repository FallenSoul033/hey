from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "IceFresh_version_12_implementation_report.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))

BLUE = colors.HexColor("#087EA4")
DEEP = colors.HexColor("#123A4D")
CYAN = colors.HexColor("#EAF8FC")
GREEN = colors.HexColor("#168159")
GREEN_BG = colors.HexColor("#E7F7EF")
AMBER = colors.HexColor("#A66B08")
AMBER_BG = colors.HexColor("#FFF6E4")
RED = colors.HexColor("#A33D3D")
RED_BG = colors.HexColor("#FFF0F0")
MUTED = colors.HexColor("#627A85")
LINE = colors.HexColor("#D9E7EC")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", fontName="Arial-Bold", fontSize=28, leading=33,
    textColor=colors.white, alignment=TA_LEFT, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="CoverSub", fontName="Arial", fontSize=12, leading=18,
    textColor=colors.HexColor("#D9F4FA"),
))
styles.add(ParagraphStyle(
    name="H1x", fontName="Arial-Bold", fontSize=19, leading=24,
    textColor=DEEP, spaceBefore=4, spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="H2x", fontName="Arial-Bold", fontSize=13, leading=17,
    textColor=BLUE, spaceBefore=12, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Bodyx", fontName="Arial", fontSize=9.4, leading=14,
    textColor=DEEP, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Smallx", fontName="Arial", fontSize=7.7, leading=11,
    textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Bulletx", fontName="Arial", fontSize=9.2, leading=13.5,
    textColor=DEEP, leftIndent=13, firstLineIndent=-8, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="StatusGood", fontName="Arial-Bold", fontSize=8, leading=10,
    textColor=GREEN, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="StatusWait", fontName="Arial-Bold", fontSize=8, leading=10,
    textColor=AMBER, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="TableHead", fontName="Arial-Bold", fontSize=8, leading=10,
    textColor=colors.white,
))
styles.add(ParagraphStyle(
    name="TableBody", fontName="Arial", fontSize=7.7, leading=10.5,
    textColor=DEEP,
))


def footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 13 * mm, width - 18 * mm, 13 * mm)
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 8.5 * mm, "IceFresh.kz - отчет реализации версии 12")
    canvas.drawRightString(width - 18 * mm, 8.5 * mm, f"Страница {doc.page}")
    canvas.restoreState()


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return p(f"- {text}", "Bulletx")


def status_box(title, body, tone="good"):
    bg = GREEN_BG if tone == "good" else AMBER_BG if tone == "wait" else RED_BG
    fg = GREEN if tone == "good" else AMBER if tone == "wait" else RED
    table = Table([[p(title, "H2x")], [p(body)]], colWidths=[174 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.7, fg),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


story = []

cover = Table([
    [p("IceFresh", "CoverTitle")],
    [p("Версия 12 - атомарный склад, финансовый журнал и контроль операций", "CoverSub")],
    [Spacer(1, 12 * mm)],
    [p("Результат реализации рекомендаций профессионального аудита v2.0", "CoverSub")],
    [p("Статус: готовый черновик для безопасного внедрения", "CoverSub")],
    [p("Дата: 16 августа 2026", "CoverSub")],
], colWidths=[174 * mm], rowHeights=[None, None, 20 * mm, None, None, None])
cover.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), DEEP),
    ("LEFTPADDING", (0, 0), (-1, -1), 16 * mm),
    ("RIGHTPADDING", (0, 0), (-1, -1), 16 * mm),
    ("TOPPADDING", (0, 0), (-1, 0), 23 * mm),
    ("BOTTOMPADDING", (0, -1), (-1, -1), 24 * mm),
]))
story.extend([Spacer(1, 20 * mm), cover, Spacer(1, 12 * mm)])
story.append(status_box(
    "Ключевой результат",
    "Создана версия, в которой заказ, производство, склад и деньги связаны серверными транзакциями. "
    "Повторная отправка защищена idempotency key, отрицательный остаток запрещен, а история движений и финансов не переписывается.",
))
story.extend([Spacer(1, 8 * mm), p(
    "Публичный icefresh.kz не переключен. Боевая миграция Supabase подготовлена, но ее применение остановлено защитным контуром до отдельного явного разрешения владельца на изменение правил учета.",
    "Bodyx",
)])
story.append(PageBreak())

story.append(p("1. Что реализовано", "H1x"))
for item in [
    "Append-only складской ledger: производство, резерв заказа, освобождение резерва и ручная корректировка являются отдельными неизменяемыми движениями.",
    "Финансовый ledger: начисленная выручка и полученная оплата фиксируются раздельно; изменение или отмена заказа создает компенсирующую проводку.",
    "Транзакционная проверка остатков: конкурентные операции блокируют карточку товара и не позволяют двум устройствам зарезервировать один и тот же свободный остаток.",
    "Идемпотентные RPC save_order и save_production_entry: повтор одного и того же запроса возвращает прежний результат вместо создания дубля.",
    "Защищенная корректировка склада только владельцем, с обязательным основанием и запретом отрицательного результата.",
    "Outbox для email, WhatsApp и webhook с состояниями pending, processing, sent, failed и dead_letter, количеством попыток и ручным возвратом в очередь.",
    "Observability: журнал системных событий с severity, типом объекта, request ID и структурированными деталями.",
    "Редактирование заказов, клиентов и записей производства через понятные формы; удаление учетных документов заменено отменой или корректировкой.",
    "Отдельный раздел для владельца и администратора: операции, финансовые движения, очередь уведомлений и ошибки доставки.",
    "Склад и AI-сводка теперь используют ledger как источник истины, а не повторный расчет из свободно изменяемых таблиц.",
]:
    story.append(bullet(item))

story.append(p("2. Соответствие аудиту v2.0", "H1x"))
rows = [[p("Рекомендация аудита", "TableHead"), p("Реализация", "TableHead"), p("Статус", "TableHead")]]
mapping = [
    ("Пункт 19 / 113: транзакционный резерв и idempotency", "Серверные триггеры, блокировка товара, operation_requests и уникальные ключи операций.", "Готово"),
    ("Пункт 52: append-only складской ledger", "Движения нельзя UPDATE/DELETE; корректировки добавляются отдельной записью.", "Готово"),
    ("Пункт 114 / 115: queue, retry, dead-letter", "Durable outbox с retry state и ручным повтором из CRM.", "Основа готова"),
    ("Пункт 116: observability", "operation_events, request ID, severity и журнал для менеджеров.", "Готово"),
    ("Пункт 107: error states", "Понятные сообщения о недостатке остатка, правах, архивном сотруднике и неизменяемом журнале.", "Готово"),
    ("Пункт 111: управляемое обновление PWA", "Сохранен текущий controlled update flow, cache version повышен до v20.", "Готово"),
    ("Пункт 125 / 126: release checklist и DoD", "Сборка, lint, регрессия, миграционный gate и отчет результата.", "Готово"),
    ("Пункт 127: E2E критического пути", "Контрактные и регрессионные тесты добавлены; полный browser E2E остается перед production.", "Перед публикацией"),
]
for left, middle, status in mapping:
    style = "StatusGood" if status in ("Готово", "Основа готова") else "StatusWait"
    rows.append([p(left, "TableBody"), p(middle, "TableBody"), p(status, style)])
tbl = Table(rows, colWidths=[54 * mm, 94 * mm, 26 * mm], repeatRows=1)
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FBFC")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(tbl)
story.append(PageBreak())

story.append(p("3. Проверка бухгалтерской и складской логики", "H1x"))
for title, body in [
    ("Выручка", "Для активного заказа начисляется количество x цена. При изменении суммы создается только разница. При отмене создается отрицательная корректировка, поэтому история сохраняется."),
    ("Оплаты", "Оплата ведется отдельным типом записи. Ограничение paid_amount <= total_amount действует и в RPC, и на уровне существующего CHECK constraint."),
    ("Дебиторская задолженность", "Долг остается расчетом выручка - полученная оплата. Отмена заказа убирает и выручку, и относящуюся к нему оплату компенсирующими движениями."),
    ("Остаток", "Остаток равен сумме движений ledger. Производство дает плюс; активный заказ резервирует минус; отмена освобождает резерв; инвентаризация добавляет отдельную корректировку."),
    ("Историчность", "Старые движения не изменяются и не удаляются. Это исключает тихое переписывание прошедших остатков и финансов."),
]:
    story.append(KeepTogether([p(title, "H2x"), p(body)]))

story.append(status_box(
    "Важно для учета",
    "Раздел аналитики является управленческим учетом IceFresh, а не налоговой или регламентированной бухгалтерской отчетностью. "
    "Для официальной отчетности данные должны быть сверены с применяемой в Казахстане учетной системой и первичными документами.",
    "wait",
))

story.append(p("4. Безопасность", "H1x"))
for item in [
    "RLS включается на всех новых публичных таблицах; сотрудники видят только склад своей организации, финансовые события доступны только owner/admin.",
    "RPC используют SECURITY DEFINER только с пустым search_path, обязательной проверкой auth.uid, активной организации и роли.",
    "На функции явно отозван EXECUTE у public/anon и выдан только authenticated.",
    "Секреты OpenAI, Supabase service role и почтового провайдера не попадают во frontend, backup ZIP или журнал уведомлений.",
    "Удаление заказов и производства запрещено: используется отмена или компенсирующее движение.",
    "Публичная заявка защищена от повторной обработки через processed_order_id и idempotency key запроса.",
]:
    story.append(bullet(item))

story.append(PageBreak())
story.append(p("5. Результаты проверок", "H1x"))
checks = [
    ("JavaScript syntax", "public/app.js и public/routes.js", "Пройдено"),
    ("Регрессионные тесты", "19 из 19, включая AI, Auth, роли, PWA, RLS-контракты и новые ledger/outbox проверки", "Пройдено"),
    ("ESLint", "Весь проект, без ошибок и предупреждений", "Пройдено"),
    ("Production build", "vinext/Vite, пять стадий сборки", "Пройдено"),
    ("Git diff check", "Пробельные ошибки и конфликтные маркеры", "Пройдено"),
    ("Автоматический browser QA", "В текущей сессии нет подключенного браузерного окна", "Ручной шаг"),
    ("Live Supabase migration", "Защитный контур потребовал отдельное подтверждение изменения правил учета", "Ожидает разрешения"),
]
rows = [[p("Проверка", "TableHead"), p("Объем", "TableHead"), p("Результат", "TableHead")]]
for name, scope, result in checks:
    style = "StatusGood" if result == "Пройдено" else "StatusWait"
    rows.append([p(name, "TableBody"), p(scope, "TableBody"), p(result, style)])
tbl = Table(rows, colWidths=[46 * mm, 98 * mm, 30 * mm], repeatRows=1)
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FBFC")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(tbl)

story.append(p("6. Что именно требует отдельного разрешения", "H1x"))
story.append(status_box(
    "Боевая миграция Supabase",
    "Миграция добавляет 4 журнала, приватную таблицу idempotency, 8 серверных функций/триггеров, RLS и индексы; "
    "запрещает DELETE для заказов и производства; начинает отклонять заказ при недостатке свободного остатка; "
    "переносит существующие записи в opening ledger. Эти изменения атомарны, но меняют поведение рабочей базы.",
    "wait",
))
story.append(Spacer(1, 5 * mm))
story.append(p(
    "Требуемая формулировка подтверждения: «Разрешаю применить миграцию atomic_inventory_ledger_outbox к рабочему проекту Supabase ogjfqnbgauuhbmauioea, включая запрет удаления заказов/производства и контроль отрицательного остатка»."
))
story.append(p(
    "После этого порядок: backup/проверка текущих строк -> apply migration -> метаданные/RLS/advisors -> smoke test owner/admin/staff -> сохранение Sites version -> отдельное разрешение на deploy icefresh.kz."
))

story.append(PageBreak())
story.append(p("7. Порядок безопасного запуска", "H1x"))
steps = [
    ("1", "Разрешить миграцию", "Подтвердить точный blast radius рабочей базы."),
    ("2", "Применить и проверить Supabase", "Проверить таблицы, RLS, grants, функции, триггеры и advisors."),
    ("3", "Провести smoke test", "Производство -> заказ -> изменение -> отмена -> корректировка -> проверка журналов."),
    ("4", "Проверить мобильный UX", "Android и iPhone: формы, таблицы-карточки, фокус, ошибки и PWA update."),
    ("5", "Опубликовать только после согласования", "Deploy сохраненной версии Sites и проверка icefresh.kz без переключения на непроверенную сборку."),
]
step_rows = []
for number, title, body in steps:
    step_rows.append([
        p(number, "StatusGood"),
        Paragraph(f"<b>{title}</b><br/>{body}", styles["Bodyx"]),
    ])
step_table = Table(step_rows, colWidths=[18 * mm, 156 * mm])
step_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), CYAN),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
]))
story.append(step_table)
story.append(Spacer(1, 8 * mm))
story.append(status_box(
    "Готовность результата",
    "Код версии 12, миграция, тесты, production build и архив готовы. Публичный домен и рабочая база не изменены без отдельного разрешения. "
    "Это осознанный release gate из аудита, а не незавершенная реализация.",
))

doc = SimpleDocTemplate(
    str(OUTPUT), pagesize=A4,
    leftMargin=18 * mm, rightMargin=18 * mm,
    topMargin=18 * mm, bottomMargin=19 * mm,
    title="IceFresh version 12 implementation report",
    author="IceFresh / Codex",
    subject="Atomic inventory ledger, finance ledger, idempotency and outbox",
)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
