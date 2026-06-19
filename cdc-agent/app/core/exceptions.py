"""
CDC Agent - Custom Exception Hierarchy

Provides structured exception types for the agent workflow:
- SkillExecutionError: recoverable/unrecoverable skill failures
- LLMOutputParseError: LLM returns unparseable output (subclass of SkillExecutionError)
- StateValidationError: missing or invalid required state fields
- WorkflowAbortError: fatal errors that should stop the entire workflow
"""

from typing import Optional


class SkillExecutionError(Exception):
    """
    Raised when a skill fails during execution.

    Attributes:
        skill_name: The name of the skill that failed.
        message: Human-readable error description.
        recoverable: Whether the workflow can continue after this error.
    """

    def __init__(
        self,
        skill_name: str,
        message: str,
        recoverable: bool = True,
    ):
        self.skill_name = skill_name
        self.message = message
        self.recoverable = recoverable
        super().__init__(f"[{skill_name}] {message}")


class LLMOutputParseError(SkillExecutionError):
    """
    Raised when LLM returns output that cannot be parsed into the expected format.

    This is a specialized SkillExecutionError that carries the raw LLM output
    and the expected format description, so callers can log or retry intelligently.

    Attributes:
        raw_output: The raw string returned by the LLM (may be truncated).
        expected_format: Description of what format was expected (e.g. "JSON with keys: is_fact_ok, report").
    """

    def __init__(
        self,
        skill_name: str,
        message: str,
        raw_output: Optional[str] = None,
        expected_format: Optional[str] = None,
        recoverable: bool = True,
    ):
        self.raw_output = raw_output
        self.expected_format = expected_format
        # Build a richer message for logging
        detail = message
        if expected_format:
            detail += f" (expected: {expected_format})"
        if raw_output:
            preview = raw_output[:200] + "..." if len(raw_output) > 200 else raw_output
            detail += f" | raw output: {preview}"
        super().__init__(skill_name=skill_name, message=detail, recoverable=recoverable)


class StateValidationError(Exception):
    """
    Raised when required state fields are missing or invalid.

    Use this to fail fast when the AgentState is in an inconsistent state
    before entering a skill or workflow node.

    Attributes:
        missing_fields: List of field names that are missing or invalid.
        message: Human-readable description of the validation failure.
    """

    def __init__(
        self,
        message: str,
        missing_fields: Optional[list] = None,
    ):
        self.missing_fields = missing_fields or []
        self.message = message
        super().__init__(message)


class WorkflowAbortError(Exception):
    """
    Raised for fatal errors that should stop the entire workflow immediately.

    This is distinct from SkillExecutionError(recoverable=False) in that
    WorkflowAbortError signals the workflow engine itself should halt,
    not just skip a step.

    Attributes:
        message: Human-readable description of the fatal error.
        cause: The original exception that triggered this abort, if any.
    """

    def __init__(
        self,
        message: str,
        cause: Optional[Exception] = None,
    ):
        self.message = message
        self.cause = cause
        super().__init__(message)
