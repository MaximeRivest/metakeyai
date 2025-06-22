tr = dspy.Predict("french -> english")
print(tr(french = sys.stdin.read()).english)