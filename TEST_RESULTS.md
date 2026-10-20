# نتائج التحقق — 2026-10-20

بيئة الاختبار الفعلية: Python 3.14.8، Frappe 16.52.0 من version-16، MariaDB 10.11.14، Redis 7.0.15، MCP SDK 1.30.0. معرف كود Frappe: 4515014c87ece6cb20ee91d2cfb121c5cbd1ff4a.

| التحقق | النتيجة |
|---|---|
| بناء الحزمة وتثبيتها Editable بمتطلبات Flit | نجح، mcp-server 1.0.0 |
| تثبيت التطبيق ومزامنة DocTypes داخل Frappe مع MariaDB وRedis | نجح |
| سجلات التهيئة | 13 بلجنًا، 18 موصلًا، 5 مهارات، 371 قدرة |
| اختبار مخططات المصادر وHTTP وقارئ دفترة | 384 اختبارًا ناجحًا |
| اختبارات قاعدة البيانات والتطبيق | 24 اختبارًا ناجحًا |
| OAuth أصلي، Authorization Code وPKCE S256 وإصدار Bearer Token | نجح على HTTP loopback في بيئة الاختبار |
| عميل MCP الرسمي يصل إلى تطبيق Frappe عبر WSGI | نجح |
| اكتشاف مهارات وقراءة تعليماتها وPrompts وResources | نجح |
| قراءة صف فعلي من نسخة Products.csv المرفقة | نجح |
| اكتشاف أدوات خادم MCP محلي ثان وتمرير استدعاء echo إليه | نجح |
| حجب أدوات الكتابة ورفض تنفيذها عند تعطيل الإذن | نجح |
| rollback للعملية الفاشلة مع بقاء سجل الفشل | نجح |
| تطبيق صلاحية المستند الأصلية في Frappe | نجح |
| اختبار POST للقراءة مثل UberFix get_status بمدخلات صريحة | نجح محليًا مع استجابة HTTP بديلة |
| أزرار وتبويبات الواجهة العربية وRTL وحدود عرض دور المستخدم | نجح في DOM فعلي باستخدام jsdom وjQuery |
| JSON وPython وJavaScript وBash للتطبيق | نجحت فحوص الصياغة |

اختبار الواجهة تحقق من التفاعلات وDOM، وليس تدقيقًا بصريًا بلقطات شاشة لمتصفح الإنتاج. توجد النتائج القابلة للقراءة في test-results/، والاختبارات في mcp_server/tests وtests. فاحص native_protocol_probe محصور بـ frappe.flags.in_test ويتطلب موقع اختبار مخصصًا؛ ينشئ عميل OAuth ومفاتيح مؤقتة للمستخدم الإداري داخل موقع الاختبار، فلا يُشغّل على الإنتاج.

المصادقة والتحقق من المستخدم والرموز في تجربة HTTP نفذهما Frappe الفعلي. الخدمات الخارجية المدفوعة لم تُستدع، ولم تُرسل رسائل أو تُنشأ فواتير في حسابات حية. لم يُثبّت التطبيق على سيرفر المستخدم ولم يُسجّل داخل حساب ChatGPT؛ يتطلب ذلك تثبيت الحزمة وإعداد العميل بالـ callback الفعلي.

## Git automation validation

A fresh local Git commit and clone, excluding environment files through .gitignore, passed checkout validation and built both sdist and wheel with Flit 3.12.0. The 384 offline tests and Arabic Desk DOM test passed again. GitHub workflow added; it has not run on GitHub. Native Bench install/migrate/build must still be exercised in the deployment staging environment. Bench uses the full editable source checkout, including az_mcp.
