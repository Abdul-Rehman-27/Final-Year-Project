from pydantic import BaseModel, Field


class BenchmarkQueryIn(BaseModel):
    lang: str = Field(pattern="^(en|ur)$")
    category: str = Field(pattern="^(triage|diseaseDetection|doctorInfo|appointment|hospitalInfo)$")
    query: str = Field(min_length=5, max_length=300)
    truth: str = Field(min_length=1, max_length=100)


class EvaluationRunIn(BaseModel):
    provider: str = Field(pattern="^(groq|ollama)$")
    model: str = Field(min_length=1, max_length=160)
