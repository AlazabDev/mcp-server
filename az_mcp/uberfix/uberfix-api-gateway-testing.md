# 🧪 أوامر اختبار دورة حياة طلب الصيانة عبر API Gateway

> \*\*جميع الأوامر تستخدم `x-api-key` فقط — لا حاجة لـ SERVICE\_ROLE\_KEY إطلاقاً.\*\*

## 🔑 المتغيرات الثابتة

```bash
export GATEWAY="https://zrrffsjbfkphridqyais.supabase.co/functions/v1/api"
export API\_KEY="uf\_test\_0ziP7jDz2WtMtUhugDwlfis2EhW7BSTX5zqQ54Xu5E"
```

\---

## 📌 المرحلة 0 — إنشاء طلب جديد

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channel": "api",
    "client\_name": "أبراهيم رجب - فرع أبوعوف",
    "client\_phone": "01004006620",
    "service\_type": "electrical",
    "description": "طلب صيانة لفرع أبوعوف",
    "priority": "high"
  }'
```

**المتوقع:** ستحصل على `request\_id` و `request\_number`. **سيصلك إشعار WhatsApp فوراً** بالنمط الجديد المنسّق.

احفظ المعرفات:

```bash
export REQ\_ID="<ضع request\_id من الرد هنا>"
export REQ\_NUM="<ضع request\_number من الرد هنا>"
```

\---

## 📌 المرحلة 1 — استعلام عن حالة الطلب

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"get\_status\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\"
  }"
```

> ملاحظة: يمكن استخدام `request\_number` بدلاً من `request\_id`.

\---

## 📌 المرحلة 2 — نقل الطلب إلى **triaged** (المراجعة)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"triaged\\",
    \\"reason\\": \\"بدء المراجعة\\"
  }"
```

**🔔 إشعار WhatsApp متوقع:** "تمت مراجعة طلبك في UberFix 📝..."

\---

## 📌 المرحلة 3 — **assigned** (تعيين فني)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"assigned\\",
    \\"reason\\": \\"تم تعيين الفني\\"
  }"
```

**🔔 إشعار WhatsApp:** رسالة المراجعة (assigned يُعرض كـ reviewed في خريطة العميل)

\---

## 📌 المرحلة 4 — **scheduled** (جدولة الموعد)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"scheduled\\",
    \\"reason\\": \\"تم تحديد موعد الزيارة\\"
  }"
```

**🔔 إشعار WhatsApp:** "تم تحديد موعد زيارة الفني لطلبك 🗓..."

\---

## 📌 المرحلة 5 — **in\_progress** (بدء التنفيذ)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"in\_progress\\",
    \\"reason\\": \\"بدء التنفيذ\\"
  }"
```

**🔔 إشعار WhatsApp:** "بدأ تنفيذ أعمال الصيانة الخاصة بطلبك 🛠..."

\---

## 📌 المرحلة 6 — **inspection** (الفحص)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"inspection\\",
    \\"reason\\": \\"فحص العمل\\"
  }"
```

\---

## 📌 المرحلة 7 — **waiting\_parts** (انتظار قطع غيار) — صامت

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"waiting\_parts\\",
    \\"reason\\": \\"بانتظار قطع غيار\\"
  }"
```

> هذه المرحلة لا ترسل إشعار (صامتة بالتصميم).

\---

## 📌 المرحلة 8 — العودة إلى **in\_progress**

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"in\_progress\\",
    \\"reason\\": \\"وصلت قطع الغيار\\"
  }"
```

\---

## 📌 المرحلة 9 — **completed** (الإنتهاء)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"completed\\",
    \\"reason\\": \\"تم إنهاء العمل\\"
  }"
```

**🔔 إشعار WhatsApp:** "تم الانتهاء من أعمال الصيانة بنجاح ✅..."

\---

## 📌 المرحلة 10 — **billed** (إصدار الفاتورة) — صامت

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"billed\\",
    \\"reason\\": \\"إصدار الفاتورة\\"
  }"
```

\---

## 📌 المرحلة 11 — **paid** (تم الدفع)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"paid\\",
    \\"reason\\": \\"تم استلام المبلغ\\"
  }"
```

\---

## 📌 المرحلة 12 — **closed** (الإغلاق النهائي)

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"transition\_stage\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"to\_stage\\": \\"closed\\",
    \\"reason\\": \\"إغلاق نهائي\\"
  }"
```

**🔔 إشعار WhatsApp:** "تم إغلاق طلب الصيانة بنجاح 🏁..."

\---

## 🛠 أوامر إضافية

### إضافة ملاحظة على الطلب

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"add\_note\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"note\\": \\"العميل طلب التواصل بعد الساعة 5 مساءً\\"
  }"
```

### إلغاء الطلب

```bash
curl -sS -X POST "$GATEWAY" \\
  -H "x-api-key: $API\_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"channel\\": \\"api\\",
    \\"action\\": \\"cancel\\",
    \\"client\_name\\": \\"x\\",
    \\"request\_id\\": \\"$REQ\_ID\\",
    \\"reason\\": \\"العميل ألغى الطلب\\"
  }"
```

\---

## 🔒 ملاحظات الأمان

* **المفتاح مقيد بالطلبات التي أنشأها هو فقط.** أي محاولة للتأثير على طلب أنشأه مفتاح آخر ستُرفض بـ `403`.
* **التحقق من المراحل القانونية فقط** — `fn\_transition\_request\_stage` يرفض الانتقالات غير المسموحة من جدول `workflow\_transitions`.
* **كل عملية مسجّلة** في `audit\_logs` و `api\_gateway\_logs` مع معرف المستهلك و IP.



export GATEWAY="https://zrrffsjbfkphridqyais.supabase.co/functions/v1/api"
export API\_KEY="uf\_test\_0ziP7jDz2WtMtUhugDwlfis2EhW7BSTX5zqQ54Xu5E"
curl -sS -X POST "$GATEWAY"   
-H "x-api-key: $API\_KEY"   
-H "Content-Type: application/json"   
-d '{
"channel": "api",
"client\_name": "علاء محمود فرع الداون تاون ابوعوف",
"client\_phone": "01004006620",
"service\_type": "electrical",
"description": "طلب صيانة لفرع الكهرباء للثلاجات",
"priority": "high"
}'
{"success":true,"request\_id":"68a71b73-180b-449c-bb64-d815b3dfe8f6","request\_number":"AZ-UF-26-09-001090","track\_url":"https://uberfix.alazab.com/track/68a71b73-180b-449c-bb64-d815b3dfe8f6","channel":"api","created\_at":"2026-09-12T17:00:27.817871+00:00"}root@azab-orchestrator:/mnexport REQ\_ID="68a71b73-180b-449c-bb64-d815b3dfe8f6"
export REQ\_NUM="AZ-UF-26-09-001090"
root@azab-orchestrator:/mnt/apps/az-wa# curl -sS -X POST "$GATEWAY"   
-H "x-api-key: $API\_KEY"   
-H "Content-Type: application/json"   
-d "{
"channel": "api",
"action": "get\_status",
"client\_name": "x",
"request\_id": "$REQ\_ID"
}"
{"success":true,"request\_id":"68a71b73-180b-449c-bb64-d815b3dfe8f6","request\_number":"AZ-UF-26-09-001090","status":"Open","workflow\_stage":"submitted","workflow\_stage\_v2":"submitted","track\_url":"https://uberfix.alazab.com/track/68a71b73-180b-449c-bb64-d815b3dfe8f6","created\_at":"2026-09-12T17:00:27.817871+00:00","updated\_at":"2026-09-12T17:00:27.817871+00:0root@azab-orchestrator:/mnt/apps/az-wa# curl -sS -X POST "$GATEWAY" "   
-H "x-api-key: $API\_KEY"   
-H "Content-Type: application/json"   
-d "{
"channel": "api",
"action": "transition\_stage",
"client\_name": "x",
"request\_id": "$REQ\_ID",
"to\_stage": "triaged",
"reason": "بدء المراجعة"
}"
{"error":"forbidden\_transition\_role: submitted -> triaged requires role "admin", actor has "none"","message\_ar":"تعذر نقل المرحلة: forbidden\_transition\_role: submitted -> triaged requires role "admin", actor has "none"","from\_stage":"submitted","to\_stage":"triaged"}root@azab-orchestrator:/mnt/apps/az-wa#
root@azab-orchestrator:/mnt/apps/az-wa# curl -sS -X POST "$GATEWAY"   
-H "x-api-key: $API\_KEY"   
-H "Content-Type: application/json"   
-d "{
"channel": "api",
"action": "transition\_stage",
"client\_name": "x",
"request\_id": "$REQ\_ID",
"to\_stage": "assigned",
"reason": "تم تعيين الفني"
}"
{"error":"forbidden\_transition\_role: submitted -> assigned requires role "admin", actor has "none"","message\_ar":"تعذر نقل المرحلة: forbidden\_transition\_role: submitted -> assigned requires role "admin", actor has "none"","from\_stagroot@azab-orchestrator:/mnt/apps/az-wa# curl -sS -X POST "$GATEWAY" /az-wa# curl -sS -X POST "$GATEWAY"   
-H "x-api-key: $API\_KEY"   
-H "Content-Type: application/json"   
-d "{
"channel": "api",
"action": "get\_status",
"client\_name": "x",
"request\_id": "$REQ\_ID"
}"
{"success":true,"request\_id":"68a71b73-180b-449c-bb64-d815b3dfe8f6","request\_number":"AZ-UF-26-09-001090","status":"Open","workflow\_stage":"submitted","workflow\_stage\_v2":"submitted","track\_url":"https://uberfix.alazab.com/track/68a71b73-180b-449c-bb64-d815b3dfe8f6","created\_at":"2026-09-12T17:00:27.817871+00:00","updated\_at":"2026-09-12T17:00:27.817871+00:0root@azab-orchestrator:/mnt/apps/az-wa# curl -sS -X POST "$GATEWAY" "   
-H "x-api-key: $API\_KEY"   
-H "Content-Type: application/json"   
-d "{
"channel": "api",
"action": "transition\_stage",
"client\_name": "x",
"request\_id": "$REQ\_ID",
"to\_stage": "triaged",
"reason": "بدء المراجعة"
}"
{"error":"forbidden\_transition\_role: submitted -> triaged requires role "admin", actor has "none"","message\_ar":"تعذر نقل المرحلة: forbidden\_transition\_role: submitted -> triaged requires role "admin", actor has "none"","from\_stage"root@azab-orchestrator:/mnt/apps/az-wa# curl -sS -X POST "$GATEWAY" -wa# curl -sS -X POST "$GATEWAY"   
-H "x-api-key: $API\_KEY"   
-H "Content-Type: application/json"   
-d "{
"channel": "api",
"action": "transition\_stage",
"client\_name": "x",
"request\_id": "$REQ\_ID",
"to\_stage": "in\_progress",
"reason": "بدء التنفيذ"
}"
{"error":"illegal\_transition: submitted -> in\_progress","message\_ar":"تعذر نقل المرحلة: illegal\_transition: submitted -> in\_progress","from\_stage":"submitted","to\_stage":"in\_progress"}root@azab-orchestrator:/mnt/apps/az-wa#
root@azab-orchestrator:/mnt/apps/az-wa#
root@azab-orchestrator:/mnt/apps/az-wa#

