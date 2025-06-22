tr = dspy.Predict("french -> english")
print(tr(french = sys.stdin.read()).english)

import sys
import dspy
lm = dspy.LM("gpt-4.1-nano")
with dspy.context(lm = lm):
    tr = dspy.Predict("french -> english")
    print(tr(french = sys.stdin.read()).english)


import sys
import dspy
lm = dspy.LM("gpt-4.1")
with dspy.context(lm = lm):
    fixer = dspy.Predict("user_text_input -> fixed_text_output")
    print(fixer(user_text_input = sys.stdin.read()).fixed_text_output)