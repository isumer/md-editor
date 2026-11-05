// Builds a greeting for a person.
public class Sample {
    /*
     * Returns a friendly greeting for the given name.
     */
    public String greet(String name) {
        String greeting = "Hello, " + name;
        // Append the punctuation on its own line.
        greeting = greeting + "!";
        return greeting;
    }
}
