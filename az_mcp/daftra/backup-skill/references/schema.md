# Daftra export schema

Source: user-provided daftra_backu.zip; ZIP entries dated 2026-09-28. This is an offline snapshot, not a live account. Counts are data records, not physical lines.

## Contents

- [Client_contacts.csv](#client_contactscsv) — 72 rows
- [Clients.csv](#clientscsv) — 64 rows
- [Expenses.csv](#expensescsv) — 241 rows
- [Invoice_items.csv](#invoice_itemscsv) — 705 rows
- [Invoices.csv](#invoicescsv) — 122 rows
- [Products.csv](#productscsv) — 3256 rows
- [Projects.csv](#projectscsv) — 3 rows
- [Purchase_order_items.csv](#purchase_order_itemscsv) — 279 rows
- [Purchase_orders.csv](#purchase_orderscsv) — 62 rows
- [Supplier_contacts.csv](#supplier_contactscsv) — 29 rows
- [Suppliers.csv](#supplierscsv) — 29 rows

## Client_contacts.csv

Rows: 72.

Columns, in original order:

`BusinessName`, `ClientNumber`, `Email`, `FirstName`, `LastName`, `HomePhone`, `mobile`


## Clients.csv

Rows: 64.

Columns, in original order:

`ClientNumber`, `BusinessName`, `FirstName`, `LastName`, `Email`, `Address1`, `Address2`, `City`, `State`, `PostalCode`, `Phone1`, `Phone2`, `CountryCode`, `LastLogin`, `StaffID`, `FollowUpStatus`, `Category`, `BusinessNumber1`, `BusinessNumber2`, `BirthDate`, `Gender`, `MapLocation`, `CreditLimitAmount`, `CreditLimitPeriod`, `NationalID`, `رقم العقد`, `حالة العقد`, `نوع العقد`, `رقم الوحدة`, `نوع الوحدة`, `الموقع`, `رفع ملف`

Duplicate nonblank keys: {}

## Expenses.csv

Rows: 241.

Columns, in original order:

`Amount`, `CurrencyCode`, `Vendor`, `Category`, `Date`, `Note`, `StaffID`

Currencies: {"EGP": 241}
Observed date strings: ["2023-02-28", "2026-08-28"]

## Invoice_items.csv

Rows: 705.

Columns, in original order:

`no`, `item`, `description`, `unit_price`, `quantity`, `subtotal`, `subtotal_without_tax`, `tax1_name`, `tax1_value`, `tax1_amount`, `tax2_name`, `tax2_value`, `tax2_amount`


## Invoices.csv

Rows: 122.

Columns, in original order:

`ID`, `InvoiceNo`, `ClientNo`, `Date`, `DueAfter`, `IssueDate`, `CurrencyCode`, `ClientBusinessName`, `DiscountPercent`, `ClientFirstName`, `ClientLastName`, `ClientEmail`, `ClientAddress1`, `ClientAddress2`, `ClientPostalCode`, `ClientCity`, `ClientState`, `ClientCountryCode`, `Notes`, `SummaryDiscount`, `SummaryTotal`, `SummaryPaid`, `SummaryUnpaid`, `SummaryDeposit`, `LastSent`, `PaymentStatus`, `StaffID`, `البريد الإلكتروني`

Duplicate nonblank keys: {"AZ-INV-2024-00177": 2}
Currencies: {"EGP": 122}
Observed date strings: ["2023-02-28", "2026-08-28"]

## Products.csv

Rows: 3256.

Columns, in original order:

`id`, `ProductCode`, `Barcode`, `Name`, `Description`, `UnitPrice`, `Discount`, `MinimumPrice`, `DiscountType`, `Brand`, `Category`, `Supplier`, `SupplierCode`, `Notes`, `Type`, `Tax1`, `Tax2`, `Status`, `BuyPrice`, `TrackStock`, `TrackingType`, `StockBalance`, `UnitTemplate`, `AverageCost`, `LowStockThershol`, `ProfitMargin`, `ServiceDurationInMinutes`, `IsFeatured`, `IsAvilableOnline`, `Item Code Input-Custom`, `Item Type Input-Custom`, `علاقات-Custom`, `التصنيف الاساسي-Custom`

Duplicate nonblank keys: {}

## Projects.csv

Rows: 3.

Columns, in original order:

`ID`, `Name`, `Active`, `Staff`

Duplicate nonblank keys: {}

## Purchase_order_items.csv

Rows: 279.

Columns, in original order:

`no`, `item`, `description`, `unit_price`, `quantity`, `subtotal`, `subtotal_without_tax`, `tax1_name`, `tax1_value`, `tax1_amount`, `tax2_name`, `tax2_value`, `tax2_amount`


## Purchase_orders.csv

Rows: 62.

Columns, in original order:

`ID`, `PurchaseOrderNo`, `SupplierNo`, `Date`, `DueAfter`, `CurrencyCode`, `SupplierBusinessName`, `DiscountPercent`, `SupplierFirstName`, `SupplierLastName`, `SupplierEmail`, `SupplierAddress1`, `SupplierAddress2`, `SupplierPostalCode`, `SupplierCity`, `SupplierState`, `SupplierCountryCode`, `Notes`, `SummaryDiscount`, `SummaryTotal`, `SummaryPaid`, `SummaryUnpaid`, `SummaryDeposit`, `LastSent`, `PaymentStatus`, `StaffID`

Duplicate nonblank keys: {}
Currencies: {"EGP": 62}
Observed date strings: ["2023-11-30", "2026-08-25"]

## Supplier_contacts.csv

Rows: 29.

Columns, in original order:

`business_name`, `supplier_number`, `first_name`, `last_name`, `email`, `home_phone`, `mobile`


## Suppliers.csv

Rows: 29.

Columns, in original order:

`SupplierNumber`, `BusinessName`, `FirstName`, `LastName`, `Email`, `Address1`, `Address2`, `State`, `PostalCode`, `Phone1`, `Phone2`, `CountryCode`, `LastLogin`, `StaffID`, `bn1_label`, `bn1`, `bn2_label`, `bn2`

Duplicate nonblank keys: {}
