"""Compatibility entry point for the original app's onboarding command."""
import frappe
from mcp_server.policy import require_manager

def setup_mcp(user_email=None,create_user=False):
    require_manager()
    from mcp_server.install import seed_records,seed_allowlists
    seed_records();seed_allowlists()
    if create_user and user_email:
        if not frappe.db.exists('User',user_email):frappe.get_doc({'doctype':'User','email':user_email,'first_name':'MCP','send_welcome_email':0,'user_type':'System User','roles':[{'role':'MCP Operator'}]}).insert(ignore_permissions=True)
    return {'status':'ready','page':'/app/mcp-center','auth':'Native Frappe authentication'}
