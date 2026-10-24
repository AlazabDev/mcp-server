"""Regression tests for the HTTP hardening (methods, failure audit, auth throttle).

Run on a dedicated test site: bench --site SITE run-tests --app mcp_server
"""
import frappe
from frappe.tests import IntegrationTestCase

from mcp_server import api, policy


class TestHardening(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		settings = frappe.get_single("MCP Server Settings")
		settings.enabled = 1
		settings.auth_mode = "Native"
		settings.save()
		frappe.db.commit()
		self.addCleanup(frappe.set_user, "Administrator")

	def test_write_endpoints_are_post_only(self):
		for fn in (api.create_doc, api.update_doc, api.delete_doc):
			self.assertEqual(frappe.allowed_http_methods_for_whitelisted_func[fn], ["POST"], fn.__name__)

	def test_read_endpoints_allow_get_and_post(self):
		for fn in (api.ping, api.get_doc, api.search_docs, api.get_meta, api.list_allowed_doctypes):
			self.assertEqual(
				sorted(frappe.allowed_http_methods_for_whitelisted_func[fn]), ["GET", "POST"], fn.__name__
			)

	def test_pagination_accepts_numeric_strings_and_rejects_garbage(self):
		allow = frappe.get_doc("MCP Doctype Allowlist", {"doctype_ref": "ToDo"})
		allow.allow_read = 1
		allow.save()
		self.assertIsInstance(api.search_docs("ToDo", page_length="2", page_start="0"), list)
		with self.assertRaises(frappe.ValidationError):
			api.search_docs("ToDo", page_length="abc")

	def test_auth_failure_throttle(self):
		frappe.local.request_ip = "203.0.113.77"
		self.addCleanup(frappe.cache.delete, policy._auth_failure_key())
		self.assertFalse(policy.auth_failures_exceeded())
		for _ in range(policy.AUTH_FAILURE_LIMIT):
			policy.note_auth_failure()
		self.assertTrue(policy.auth_failures_exceeded())
		frappe.local.request_ip = "203.0.113.78"  # another client is not affected
		self.assertFalse(policy.auth_failures_exceeded())

	def test_failed_direct_call_is_audited_and_persisted(self):
		doctype = "Letter Head"
		self.assertFalse(frappe.db.exists("MCP Doctype Allowlist", {"doctype_ref": doctype}))
		frappe.db.delete("MCP Audit Log", {"tool_name": "search_docs", "ref_doctype": doctype})
		frappe.db.commit()
		self.addCleanup(self._cleanup_audit, doctype)

		with self.assertRaises(frappe.PermissionError):
			api.search_docs(doctype=doctype)  # HTTP passes keyword args, which the audit reads

		# the failed call already rolled back + committed its own audit row
		row = frappe.db.get_value(
			"MCP Audit Log",
			{"tool_name": "search_docs", "ref_doctype": doctype},
			["status", "mcp_user"],
			as_dict=True,
		)
		self.assertIsNotNone(row)
		self.assertEqual(row.status, "Fail")
		self.assertEqual(row.mcp_user, "Administrator")

	def test_unauthenticated_failure_is_not_stored(self):
		frappe.set_user("Guest")
		before = frappe.db.count("MCP Audit Log")
		with self.assertRaises(frappe.PermissionError):
			api.ping()
		frappe.db.rollback()  # what Frappe does on error
		self.assertEqual(frappe.db.count("MCP Audit Log"), before)

	@staticmethod
	def _cleanup_audit(doctype):
		frappe.db.delete("MCP Audit Log", {"tool_name": "search_docs", "ref_doctype": doctype})
		frappe.db.commit()
