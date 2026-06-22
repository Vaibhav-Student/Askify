import types
import sys
from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel, ConfigDict
from langchain_core.runnables import run_in_executor

print("Step 1", flush=True)

class BaseMemory(BaseModel, ABC):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @property
    @abstractmethod
    def memory_variables(self) -> list[str]:
        pass

    @abstractmethod
    def load_memory_variables(self, inputs):
        pass

    @abstractmethod
    def save_context(self, inputs, outputs):
        pass

    @abstractmethod
    def clear(self):
        pass

print("Class defined", flush=True)

compat_module = types.ModuleType('langchain_core.memory')
compat_module.BaseMemory = BaseMemory
sys.modules['langchain_core.memory'] = compat_module
print("Module created", flush=True)